import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Trip
from ..schemas import (
    BlockSchema,
    RecomputeRequest,
    RecomputeResponse,
    TripState,
)
from ..services.llm import LLMError, LLMNotConfiguredError
from ..services.llm_schema import LLMValidationError
from ..services.recompute_service import (
    AnchorProtectionError,
    RecomputeConflictError,
    RecomputeOutputError,
    RecomputePersistenceError,
    TripNotFoundError,
    apply_recompute,
    plan_recompute,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["recompute"])


@router.post("/recompute", response_model=RecomputeResponse)
async def recompute(payload: RecomputeRequest, db: Session = Depends(get_db)):
    try:
        trip = (
            db.execute(
                select(Trip)
                .options(joinedload(Trip.blocks))
                .where(Trip.id == payload.trip_id)
            )
            .unique()
            .scalar_one_or_none()
        )
    except SQLAlchemyError:
        logger.exception("读取行程失败")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="读取行程失败",
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
    protected = [block for block in block_schemas if block.is_anchor]
    mutable = [block for block in block_schemas if not block.is_anchor]
    original_state = TripState(trip_id=trip.id, blocks=block_schemas)
    trip_id = trip.id

    db.rollback()

    if not mutable:
        return RecomputeResponse(
            changed_ids=[],
            trip_state=original_state,
            message="没有可调整的非锚点行程",
        )

    try:
        plan = await plan_recompute(
            trip_id,
            payload.change_desc,
            protected,
            mutable,
        )
    except LLMNotConfiguredError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM 服务未配置",
        )
    except LLMValidationError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="模型返回的 JSON 未通过校验",
        )
    except RecomputeOutputError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )
    except LLMError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="行程重算服务暂不可用",
        )
    except Exception:
        db.rollback()
        logger.exception("重算规划失败")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="行程重算失败",
        )

    if not plan.affected_ids and not plan.new_blocks:
        return RecomputeResponse(
            changed_ids=[],
            trip_state=original_state,
            message="未识别到需要调整的非锚点行程",
        )

    try:
        return apply_recompute(db, trip_id, protected, plan)
    except TripNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found",
        )
    except (RecomputeConflictError, AnchorProtectionError) as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )
    except RecomputePersistenceError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="保存行程失败",
        )
    except Exception:
        db.rollback()
        logger.exception("保存重算结果失败")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="保存行程失败",
        )
