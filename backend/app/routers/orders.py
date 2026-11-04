import base64
import binascii
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Block, Trip
from ..schemas import BlockSchema, ParseOrderRequest, ParseOrderResponse
from ..services.llm import (
    LLMError,
    LLMNotConfiguredError,
    VisionNotConfiguredError,
    vision_configured,
)
from ..services.order_parser import (
    OrderParseError,
    parse_order_image,
    parse_order_text,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["orders"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _prepare_image_data_url(payload: ParseOrderRequest) -> str:
    raw = (payload.image_base64 or "").strip()
    mime = payload.image_mime_type

    if raw.startswith("data:"):
        header, separator, data = raw.partition(",")
        if not separator or not header.startswith("data:image/"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="图片 data URL 无效",
            )
        if mime is None:
            mime = header[5:].split(";", 1)[0]
        raw = data.strip()

    mime = (mime or "image/jpeg").lower()
    if mime not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="仅支持 JPEG、PNG、WebP 图片",
        )
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="图片数据为空",
        )
    if len(raw) > int(MAX_IMAGE_BYTES * 4 / 3) + 4:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="图片不能超过 5MB",
        )

    try:
        decoded = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="图片 base64 数据无效",
        )

    if len(decoded) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="图片不能超过 5MB",
        )

    return f"data:{mime};base64,{raw}"


@router.post("/parse_order", response_model=ParseOrderResponse)
async def parse_order(payload: ParseOrderRequest, db: Session = Depends(get_db)):
    text = (payload.order_text or "").strip()
    has_text = bool(text)
    has_image = bool((payload.image_base64 or "").strip())

    if has_text == has_image:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="请提供 order_text 或 image_base64 其中之一",
        )

    image_data_url = None
    if has_image:
        if not vision_configured():
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail=(
                    "当前未配置视觉模型，无法识别图片。"
                    "请设置 VISION_LLM_API_KEY、VISION_LLM_BASE_URL、VISION_LLM_MODEL 后重试。"
                ),
            )
        image_data_url = _prepare_image_data_url(payload)

    try:
        if image_data_url is not None:
            parsed = await parse_order_image(image_data_url)
        else:
            parsed = await parse_order_text(text)
    except VisionNotConfiguredError as error:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=str(error),
        )
    except LLMNotConfiguredError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM 服务未配置",
        )
    except OrderParseError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="未能识别订单信息，请确认文本或图片包含酒店、航班或门票名称",
        )
    except LLMError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="订单解析失败，请稍后重试",
        )

    if not parsed.activity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="未能识别订单活动名称，请补充订单文本或图片",
        )

    has_date = bool(parsed.date)
    has_time = bool(parsed.time_slot)
    has_location = bool(parsed.location)
    is_anchor = has_date and has_time and has_location

    block = Block(
        day=parsed.day or 1,
        date=parsed.date or "",
        time_slot=parsed.time_slot or "",
        activity=parsed.activity,
        location=parsed.location or "",
        is_anchor=is_anchor,
        status="anchored" if is_anchor else "normal",
    )

    try:
        trip = db.get(Trip, payload.trip_id)
    except SQLAlchemyError:
        logger.exception("读取行程失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="读取行程失败",
        )

    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="行程不存在",
        )

    try:
        trip.blocks.append(block)
        db.flush()
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("保存订单锚点失败")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="保存订单锚点失败",
        )

    db.refresh(block)

    return ParseOrderResponse(
        success=is_anchor,
        new_block=BlockSchema.model_validate(block),
    )
