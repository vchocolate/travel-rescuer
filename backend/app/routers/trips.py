import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models import Block, Trip
from ..schemas import BlockSchema, InitTripRequest, TripState
from ..services.llm import LLMNotConfiguredError
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
