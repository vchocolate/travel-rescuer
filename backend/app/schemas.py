from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

BlockStatus = Literal["normal", "anchored", "affected", "candidate"]
DATE_FALLBACK = "待定"


class BlockSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    block_id: str = Field(
        description="正式环境为 UUID 字符串；Mock 可使用 b1、b2 等稳定短 ID"
    )
    day: int = Field(ge=1)
    date: str = Field(
        default=DATE_FALLBACK,
        description="日期，优先 YYYY-MM-DD；历史空值返回待定",
    )
    time_slot: str
    activity: str
    location: str
    is_anchor: bool = False
    status: BlockStatus = "normal"

    @field_validator("date", mode="before")
    @classmethod
    def normalize_date(cls, value):
        if value is None:
            return DATE_FALLBACK
        if isinstance(value, str):
            value = value.strip()
            return value or DATE_FALLBACK
        return value


class TripState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trip_id: UUID
    blocks: list[BlockSchema]


class InitTripRequest(BaseModel):
    trip_id: UUID | None = None
    query: str = Field(min_length=1, max_length=2000)


class ParseOrderRequest(BaseModel):
    trip_id: UUID
    order_text: str | None = Field(default=None, max_length=5000)
    image_base64: str | None = None
    image_mime_type: Literal["image/jpeg", "image/png", "image/webp"] | None = None


class ParseOrderResponse(BaseModel):
    success: bool
    new_block: BlockSchema | None = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class SearchResponse(BaseModel):
    title: str
    url: str
    highlights: list[str]
    pitfalls: list[str]


class RecomputeRequest(BaseModel):
    trip_id: UUID
    change_desc: str = Field(min_length=1, max_length=2000)


class RecomputeResponse(BaseModel):
    changed_ids: list[str]
    trip_state: TripState
    message: str | None = None


UpdateBlockAction = Literal["delete", "lock", "unlock", "confirm_replace"]


class UpdateBlockRequest(BaseModel):
    action: UpdateBlockAction
    block_id: str = Field(min_length=1)
    target_block_id: str | None = None
