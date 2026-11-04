import logging
import re
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .llm import LLMError, LLMNotConfiguredError
from .llm_schema import generate_model

logger = logging.getLogger(__name__)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

SCHEDULE_SYSTEM_PROMPT = """你是普通日程抽取器。用户想往旅行行程里记录一个非订单日程，请从文本中抽取信息。
只输出一个 JSON 对象：
{"date": "2026-11-08", "time_slot": "15:00", "activity": "去朋友家", "location": "朋友家"}

规则：
1. 只提取用户明确说出的信息，禁止猜测或编造。
2. date 优先输出 YYYY-MM-DD；只说月日时按当前年份补全；没有日期返回 null。
3. time_slot 是用户说出的时间原文；没有时间返回 null。
4. activity 是日程标题，必须简洁明确，例如“去朋友家”“看展”“和朋友吃饭”；没有日程内容返回 null。
5. location 是文本中的地点/区域；没有返回 null。
6. 这是普通日程，不是已确认订单；不要推断酒店、航班、门票等订单信息，也不要输出锚点字段。
7. 如果文本不是在记录日程、信息无法抽取或内容为空，activity 返回 null。
8. 只输出 JSON，不要 Markdown，不要解释。"""


class ParsedSchedule(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

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

        if DATE_RE.fullmatch(value):
            return value

        match = re.fullmatch(
            r"(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日", value
        )
        if match:
            year = int(match.group(1)) if match.group(1) else date.today().year
            return f"{year:04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"

        raise ValueError("date 必须是 YYYY-MM-DD、M月D日或 null")


class ScheduleParseError(RuntimeError):
    pass


def _repair_note() -> str:
    return (
        "\n\n上一次输出未通过 JSON Schema 校验。"
        "请严格按 schema 重新输出，只输出 JSON。"
    )


async def parse_schedule_text(schedule_text: str) -> ParsedSchedule:
    text = (schedule_text or "").strip()
    if not text:
        raise ScheduleParseError("日程文本不能为空")

    last_error: Exception | None = None
    today = date.today().isoformat()

    for attempt in range(2):
        user_text = f"当前日期：{today}\n用户要记录的日程：{text}"
        if attempt == 1:
            user_text += _repair_note()

        try:
            return await generate_model(
                ParsedSchedule,
                SCHEDULE_SYSTEM_PROMPT,
                user_text,
                max_tokens=1024,
                timeout=60,
            )
        except LLMNotConfiguredError:
            raise
        except LLMError as error:
            last_error = error
            logger.warning(
                "普通日程解析失败（第 %s 次）：%s",
                attempt + 1,
                type(error).__name__,
            )

    raise ScheduleParseError("日程解析失败，请稍后重试") from last_error


__all__ = ["ParsedSchedule", "ScheduleParseError", "parse_schedule_text"]
