import logging
import re
from datetime import date

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from ..schemas import BlockStatus
from .llm import LLMError, LLMNotConfiguredError
from .llm_schema import generate_model

logger = logging.getLogger(__name__)

TIME_SLOT_RE = re.compile(
    r"^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$"
)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

SYSTEM_PROMPT = """你是行程规划器。根据用户的自然语言需求，生成可直接执行的行程块。
只输出一个 JSON 对象，结构如下：
{"blocks": [{"day": 1, "date": "2026-11-07", "time_slot": "09:00-11:00", "activity": "示例活动", "location": "城市·区域", "is_anchor": false, "status": "normal"}]}

规则：
1. 只输出 JSON，不要 Markdown、解释或多余文字。
2. day 从 1 开始；用户未说明天数时默认 2 天；每天 3-5 个块。
3. date 使用 YYYY-MM-DD；用户未指定日期时，根据当前日期和需求推断合理日期；同一天使用同一日期。
4. time_slot 必须是 24 小时制 "HH:MM-HH:MM"，同一天内不能重叠，保留交通和用餐时间。
5. activity 要具体、可执行；location 写到城市和区域/地点。
6. 只有用户明确提供已确认的酒店、机票、门票等订单，且该块本身就是入住、乘车、入园等订单活动时，is_anchor 才为 true；普通的“回酒店取行李、返程”等不算锚点，初始规划中绝大多数块应为 false。
7. status 只能是 normal、anchored、affected、candidate；初始规划默认 normal，锚点使用 anchored，不要使用 affected 或 candidate。
8. 必须遵守用户提到的目的地、日期、预算、同行人和偏好，不要编造已确认订单。
9. 使用中文填写 activity 和 location。"""


class PlannedBlock(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    day: int = Field(ge=1, le=30)
    date: str = Field(min_length=1, max_length=32)
    time_slot: str
    activity: str = Field(min_length=1, max_length=255)
    location: str = Field(min_length=1, max_length=255)
    is_anchor: bool = False
    status: BlockStatus = "normal"

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value):
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        if not DATE_RE.fullmatch(value):
            raise ValueError("date 必须为 YYYY-MM-DD")
        return value

    @field_validator("time_slot")
    @classmethod
    def validate_time_slot(cls, value: str) -> str:
        match = TIME_SLOT_RE.fullmatch(value)
        if not match:
            raise ValueError("time_slot 必须为 HH:MM-HH:MM")

        start_hour, start_minute, end_hour, end_minute = map(int, match.groups())
        start = start_hour * 60 + start_minute
        end = end_hour * 60 + end_minute
        if end <= start:
            raise ValueError("time_slot 结束时间必须晚于开始时间")
        return value

    @model_validator(mode="after")
    def normalize_anchor(self):
        if self.is_anchor:
            self.status = "anchored"
        elif self.status == "anchored":
            self.is_anchor = True
        return self


class PlannedTrip(BaseModel):
    blocks: list[PlannedBlock] = Field(min_length=1, max_length=50)


class ItineraryGenerationError(RuntimeError):
    pass


def _sort_key(block: PlannedBlock) -> tuple[int, int, int]:
    start = block.time_slot.split("-", 1)[0]
    hour, minute = start.split(":", 1)
    return (block.day, int(hour), int(minute))


async def generate_blocks(user_input: str) -> list[PlannedBlock]:
    text = (user_input or "").strip()
    if not text:
        raise ItineraryGenerationError("行程需求不能为空")

    last_error: Exception | None = None
    today = date.today().isoformat()

    for attempt in range(2):
        user_content = f"当前日期：{today}\n用户需求：{text[:4000]}"
        if attempt == 1:
            user_content = (
                f"{user_content}\n\n"
                "上一次输出未通过 JSON Schema 校验。"
                "请严格按 schema 重新输出，只输出 JSON。"
            )

        try:
            trip = await generate_model(
                PlannedTrip,
                SYSTEM_PROMPT,
                user_content,
                max_tokens=8192,
                timeout=120,
            )
            return sorted(trip.blocks, key=_sort_key)
        except LLMNotConfiguredError:
            raise
        except LLMError as error:
            last_error = error
            logger.warning(
                "行程生成失败（第 %s 次）：%s", attempt + 1, type(error).__name__
            )

    raise ItineraryGenerationError("行程生成失败，请稍后重试") from last_error


__all__ = [
    "ItineraryGenerationError",
    "PlannedBlock",
    "PlannedTrip",
    "generate_blocks",
]
