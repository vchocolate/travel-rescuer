from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

BlockStatus = Literal["normal", "anchored", "affected", "candidate"]


class BlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    block_id: str = Field(
        description="正式环境为 UUID 字符串；Mock 可使用 b1、b2 等稳定短 ID"
    )
    day: int = Field(ge=1)
    time_slot: str
    activity: str
    location: str
    is_anchor: bool
    status: BlockStatus


class TripState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trip_id: UUID
    blocks: list[BlockOut]


class EvidenceOut(BaseModel):
    title: str
    url: str
    summary: str
    retrieved_at: datetime


class InitTripRequest(BaseModel):
    trip_id: UUID | None = None
    message: str = Field(min_length=1, max_length=2000)


class SearchRequest(BaseModel):
    trip_id: UUID
    query: str = Field(min_length=1, max_length=500)


class ParseOrderRequest(BaseModel):
    trip_id: UUID
    order_text: str = Field(min_length=1, max_length=5000)


class RecomputeRequest(BaseModel):
    trip_id: UUID
    change: str = Field(min_length=1, max_length=2000)


class RecomputeResponse(TripState):
    changed_ids: list[str]
