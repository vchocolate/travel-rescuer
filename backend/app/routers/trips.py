import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models import Block, Trip
from ..schemas import (
    BlockSchema,
    InitTripRequest,
    IntentRequest,
    IntentResponse,
    ScheduleRequest,
    ScheduleResponse,
    TripState,
    UpdateBlockRequest,
)
from ..services.block_dates import resolve_day, trip_has_date
from ..services.intent_service import classify_intent
from ..services.llm import LLMError, LLMNotConfiguredError
from ..services.schedule_parser import ScheduleParseError, parse_schedule_text
from ..services.trip_planner import ItineraryGenerationError, generate_blocks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["trips"])


@router.post("/init_trip", response_model=TripState)
async def init_trip(payload: InitTripRequest, db: Session = Depends(get_db)):
    try:
        planned_blocks = await generate_blocks(payload.query)
    except LLMNotConfiguredError:
        logger.error("init_trip 失败：LLM_API_KEY 未配置")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM 服务未配置",
        )
    except ItineraryGenerationError:
        logger.warning("init_trip 失败：行程生成未通过校验")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="行程生成失败，请稍后重试",
        )

    try:
        if payload.trip_id is not None:
            trip = db.get(Trip, payload.trip_id)
            if trip is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="行程不存在",
                )
            trip.blocks.clear()
        else:
            trip = Trip()
            db.add(trip)

        for planned in planned_blocks:
            trip.blocks.append(
                Block(
                    day=planned.day,
                    date=planned.date,
                    time_slot=planned.time_slot,
                    activity=planned.activity,
                    location=planned.location,
                    is_anchor=planned.is_anchor,
                    status=planned.status,
                )
            )

        db.flush()
        trip_id = trip.id
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("保存行程失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="保存行程失败",
        )

    try:
        stored_trip = db.execute(
            select(Trip)
            .options(selectinload(Trip.blocks))
            .where(Trip.id == trip_id)
        ).scalar_one()
    except SQLAlchemyError:
        logger.exception("读取行程失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取行程失败",
        )

    blocks = sorted(
        stored_trip.blocks,
        key=lambda block: (block.day, block.time_slot),
    )
    return TripState(
        trip_id=stored_trip.id,
        blocks=[BlockSchema.model_validate(block) for block in blocks],
    )


@router.get("/trip/{trip_id}", response_model=TripState)
def get_trip(trip_id: str, db: Session = Depends(get_db)):
    try:
        trip_uuid = UUID(trip_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    try:
        trip = (
            db.execute(
                select(Trip)
                .options(joinedload(Trip.blocks))
                .where(Trip.id == trip_uuid)
            )
            .unique()
            .scalar_one_or_none()
        )
    except SQLAlchemyError:
        logger.exception("读取行程失败")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        )

    if trip is None or not trip.blocks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    blocks = sorted(
        trip.blocks,
        key=lambda block: (block.day, block.time_slot),
    )
    return TripState(
        trip_id=trip.id,
        blocks=[BlockSchema.model_validate(block) for block in blocks],
    )


@router.post("/trip/{trip_id}/intent", response_model=IntentResponse)
async def classify_trip_intent(
    trip_id: str,
    payload: IntentRequest,
    db: Session = Depends(get_db),
):
    try:
        trip_uuid = UUID(trip_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    try:
        trip = (
            db.execute(
                select(Trip)
                .options(selectinload(Trip.blocks))
                .where(Trip.id == trip_uuid)
            )
            .scalar_one_or_none()
        )
    except SQLAlchemyError:
        logger.exception("读取行程失败")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        )

    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    blocks = sorted(
        trip.blocks,
        key=lambda block: (block.day, block.time_slot),
    )
    block_schemas = [BlockSchema.model_validate(block) for block in blocks]

    try:
        result = await classify_intent(payload.text, block_schemas)
    except LLMNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM 服务未配置",
        )
    except LLMError:
        logger.exception("意图判断失败")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="意图判断失败，请稍后重试",
        )

    return IntentResponse(intent=result.intent, message=result.message)


@router.post("/trip/{trip_id}/schedule", response_model=ScheduleResponse)
async def add_trip_schedule(
    trip_id: str,
    payload: ScheduleRequest,
    db: Session = Depends(get_db),
):
    try:
        trip_uuid = UUID(trip_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    try:
        trip = (
            db.execute(
                select(Trip)
                .options(selectinload(Trip.blocks))
                .where(Trip.id == trip_uuid)
            )
            .scalar_one_or_none()
        )
    except SQLAlchemyError:
        logger.exception("读取行程失败")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        )

    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    try:
        parsed = await parse_schedule_text(payload.text)
    except LLMNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM 服务未配置",
        )
    except ScheduleParseError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="未能识别日程内容，请补充日期、时间或具体安排",
        )
    except LLMError:
        logger.exception("日程解析失败")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="日程解析失败，请稍后重试",
        )

    if not parsed.activity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="未能识别日程内容，请补充日期、时间或具体安排",
        )

    trip_blocks = sorted(
        trip.blocks,
        key=lambda block: (block.day, block.time_slot),
    )
    date_in_trip = trip_has_date(parsed.date, trip_blocks)
    day = resolve_day(parsed.date, trip_blocks, 1)

    block = Block(
        day=day,
        date=parsed.date or "",
        time_slot=parsed.time_slot or "",
        activity=parsed.activity,
        location=parsed.location or "",
        is_anchor=False,
        status="normal",
    )

    try:
        trip.blocks.append(block)
        db.flush()
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("保存日程失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="保存日程失败",
        )

    db.refresh(block)

    if not parsed.date:
        message = "已记录日程，但日期未识别，请补充日期后确认。"
    elif not date_in_trip:
        message = "日期不在当前行程范围内，已作为普通日程加入，未锁定锚点。"
    else:
        message = "已记录到当前行程。"

    return ScheduleResponse(
        success=True,
        new_block=BlockSchema.model_validate(block),
        message=message,
    )


@router.post("/trip/{trip_id}/update", response_model=TripState)
def update_trip_block(
    trip_id: str,
    payload: UpdateBlockRequest,
    db: Session = Depends(get_db),
):
    try:
        trip_uuid = UUID(trip_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    try:
        block_uuid = UUID(payload.block_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Block not found",
        )

    target_uuid = None
    if payload.action == "confirm_replace":
        if not payload.target_block_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="target_block_id is required for confirm_replace",
            )
        try:
            target_uuid = UUID(payload.target_block_id)
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target block not found",
            )
        if target_uuid == block_uuid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="block_id and target_block_id must differ",
            )

    try:
        with db.begin():
            trip = (
                db.execute(
                    select(Trip)
                    .options(selectinload(Trip.blocks))
                    .where(Trip.id == trip_uuid)
                )
                .scalar_one_or_none()
            )
            if trip is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Trip not found",
                )

            blocks_by_id = {str(block.id): block for block in trip.blocks}
            block = blocks_by_id.get(str(block_uuid))
            if block is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Block not found",
                )

            if payload.action == "delete":
                db.delete(block)
            elif payload.action == "lock":
                block.is_anchor = True
                block.status = "anchored"
            elif payload.action == "unlock":
                block.is_anchor = False
                block.status = "normal"
            else:
                target = blocks_by_id.get(str(target_uuid))
                if target is None:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Target block not found",
                    )
                if target.status != "candidate":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Target block is not a candidate",
                    )
                db.delete(block)
                target.status = "normal"

            db.flush()
    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        logger.exception("更新行程块失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新行程失败",
        )

    try:
        stored_trip = (
            db.execute(
                select(Trip)
                .options(selectinload(Trip.blocks))
                .where(Trip.id == trip_uuid)
            )
            .scalar_one_or_none()
        )
    except SQLAlchemyError:
        logger.exception("读取更新后的行程失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取行程失败",
        )

    if stored_trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )

    blocks = sorted(
        stored_trip.blocks,
        key=lambda block: (block.day, block.time_slot),
    )
    return TripState(
        trip_id=stored_trip.id,
        blocks=[BlockSchema.model_validate(block) for block in blocks],
    )
