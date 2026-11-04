import logging
import re
from datetime import date

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)

from .llm import (
    LLMError,
    LLMNotConfiguredError,
    VisionNotConfiguredError,
    vision_api_key,
    vision_base_url,
    vision_configured,
    vision_model,
)
from .llm_schema import generate_model

logger = logging.getLogger(__name__)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

SYSTEM_PROMPT = """你是订单信息提取器。从酒店、机票、火车票、门票等订单文本或截图中提取信息。
只输出一个 JSON 对象，结构如下：
{"day": 1, "date": "2026-11-05", "time_slot": "15:00", "activity": "广州某酒店 · 入住", "location": "广州荔湾区"}

规则：
1. 只提取原文或图片中明确出现的信息，禁止猜测或编造。
2. date：入住、乘车、入园等日期，优先 YYYY-MM-DD；原文只有月日时按当前日期补全年份；没有则返回 null。
3. time_slot：入住、乘车、入园等时间原文；没有则返回 null。
4. activity：订单活动名称，必须包含酒店名、航班号或门票名；没有则返回 null。
5. location：订单中的地址、城市或区域；没有则返回 null。
6. day：能判断是行程第几天时返回整数，否则返回 1。
7. 只输出 JSON，不要 Markdown，不要解释。"""


class ParsedOrder(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    day: int | None = Field(default=None, ge=1, le=30)
    date: str | None = Field(default=None, max_length=32)
    time_slot: str | None = Field(default=None, max_length=255)
    activity: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=255)

    @field_validator("date", "time_slot", "activity", "location", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not DATE_RE.fullmatch(value):
            raise ValueError("date 必须为 YYYY-MM-DD 或 null")
        return value


class OrderParseError(RuntimeError):
    pass


def _repair_note() -> str:
    return (
        "\n\n上一次输出未通过 JSON Schema 校验。"
        "请严格按 schema 重新输出，只输出 JSON。"
    )


async def parse_order_text(order_text: str) -> ParsedOrder:
    text = (order_text or "").strip()
    if not text:
        raise OrderParseError("订单文本不能为空")

    last_error: Exception | None = None
    today = date.today().isoformat()

    for attempt in range(2):
        user_text = f"当前日期：{today}\n订单内容：{text}"
        if attempt == 1:
            user_text += _repair_note()

        try:
            return await generate_model(
                ParsedOrder,
                SYSTEM_PROMPT,
                user_text,
                max_tokens=4096,
                timeout=90,
            )
        except LLMNotConfiguredError:
            raise
        except LLMError as error:
            last_error = error
            logger.warning(
                "订单文本解析失败（第 %s 次）：%s",
                attempt + 1,
                type(error).__name__,
            )

    raise OrderParseError("订单解析失败，请稍后重试") from last_error


async def parse_order_image(image_data_url: str) -> ParsedOrder:
    if not vision_configured():
        raise VisionNotConfiguredError(
            "当前未配置视觉模型，无法识别图片。"
            "请设置 VISION_LLM_API_KEY、VISION_LLM_BASE_URL、VISION_LLM_MODEL。"
        )

    last_error: Exception | None = None
    today = date.today().isoformat()

    for attempt in range(2):
        user_text = f"当前日期：{today}\n请识别这张订单截图并提取信息。"
        if attempt == 1:
            user_text += _repair_note()

        try:
            return await generate_model(
                ParsedOrder,
                SYSTEM_PROMPT,
                user_text,
                image_data_url=image_data_url,
                max_tokens=4096,
                timeout=90,
                model=vision_model(),
                base_url=vision_base_url(),
                api_key=vision_api_key(),
            )
        except (LLMNotConfiguredError, VisionNotConfiguredError):
            raise
        except LLMError as error:
            last_error = error
            logger.warning(
                "订单图片解析失败（第 %s 次）：%s",
                attempt + 1,
                type(error).__name__,
            )

    raise OrderParseError("订单解析失败，请稍后重试") from last_error


__all__ = [
    "OrderParseError",
    "ParsedOrder",
    "parse_order_image",
    "parse_order_text",
]
