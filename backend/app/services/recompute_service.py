import json
import re
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..models import Block, Trip
from ..schemas import (
    DATE_FALLBACK,
    BlockSchema,
    RecomputeResponse,
    TripState,
)
from .llm_schema import generate_model

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

RECOMPUTE_SYSTEM_PROMPT = """你是行程局部重算器。用户会提供 trip_id、change_desc、protected_blocks 和 mutable_blocks。
protected_blocks 是 is_anchor=true 的订单锚点，绝对不可侵犯：不得修改、删除、移动、改名或改变状态。
输出中必须原样包含每个锚点的 block_id、day、date、time_slot、activity、location、is_anchor、status。

mutable_blocks 是非锚点行程，可以调整。
任务：
1. 根据 change_desc 判断哪些 mutable_blocks 受影响。
2. 受影响的 mutable_blocks 原样保留，并将 status 设为 affected。
3. 为受影响块生成替代方案，status 设为 candidate，is_anchor 设为 false，block_id 使用新的唯一字符串（如 new-1）；替代块必须填写 date。
4. 未受影响的 mutable_blocks 原样保留。
5. 输出完整行程列表；date 使用 YYYY-MM-DD，锚点日期不得改变。

规则：
1. 绝对不能新增锚点，不能把任何块设为 anchored。
2. 替代方案的时间、地点必须避开 protected_blocks 的时间、地点约束。
3. changed_ids 只列出受影响块和替代块 ID，绝不能包含锚点 ID。
4. trip_id 必须与输入一致。
5. 如果 protected_blocks 中某个块的 date 是 "待定"，必须保持 "待定"，不要擅自补日期。
6. 只输出 JSON，必须符合 schema。"""


class RecomputeError(RuntimeError):
    pass


class RecomputeOutputError(RecomputeError):
    pass


class AnchorProtectionError(RecomputeOutputError):
    pass


class TripNotFoundError(RecomputeError):
    pass


class RecomputeConflictError(RecomputeError):
    pass


class RecomputePersistenceError(RecomputeError):
    pass


@dataclass(frozen=True)
class RecomputePlan:
    affected_ids: list[str]
    new_blocks: list[BlockSchema]


def _sort_key(block: BlockSchema | Block) -> tuple[int, str]:
    return (block.day, block.time_slot)


PROTECTED_FIELDS = (
    "day",
    "date",
    "time_slot",
    "activity",
    "location",
    "is_anchor",
    "status",
)


def _assert_protected_blocks(
    protected: list[BlockSchema],
    blocks: list[BlockSchema],
) -> set[str]:
    by_id: dict[str, BlockSchema] = {}
    for block in blocks:
        if block.block_id in by_id:
            raise RecomputeOutputError("模型返回了重复的 block_id")
        by_id[block.block_id] = block

    for expected in protected:
        current = by_id.get(expected.block_id)
        if current is None:
            raise AnchorProtectionError(
                f"锚点块 {expected.block_id} 被删除或替换"
            )
        for field in PROTECTED_FIELDS:
            if getattr(current, field) != getattr(expected, field):
                raise AnchorProtectionError(
                    f"锚点块 {expected.block_id} 的 {field} 被修改"
                )

    return {block.block_id for block in protected}


def _build_plan(
    trip_id,
    protected: list[BlockSchema],
    mutable: list[BlockSchema],
    result: RecomputeResponse,
) -> RecomputePlan:
    if result.trip_state.trip_id != trip_id:
        raise RecomputeOutputError("模型返回的 trip_id 不一致")

    blocks = result.trip_state.blocks
    protected_ids = _assert_protected_blocks(protected, blocks)

    if protected_ids & set(result.changed_ids):
        raise AnchorProtectionError("changed_ids 中包含锚点 ID")

    existing_ids = {block.block_id for block in protected + mutable}
    affected_ids: list[str] = []
    new_blocks: list[BlockSchema] = []

    for block in blocks:
        if block.block_id in existing_ids:
            if block.block_id in protected_ids:
                continue
            if block.is_anchor:
                raise AnchorProtectionError(
                    f"非锚点块 {block.block_id} 被改成锚点"
                )
            if block.status in {"anchored", "candidate"}:
                raise RecomputeOutputError(
                    f"已有非锚点块 {block.block_id} 的状态非法：{block.status}"
                )
            if block.status == "affected":
                affected_ids.append(block.block_id)
        else:
            if block.is_anchor or block.status != "candidate":
                raise RecomputeOutputError("新增块必须是 candidate 且不能是锚点")
            if (
                not block.date
                or block.date == DATE_FALLBACK
                or not DATE_RE.fullmatch(block.date)
            ):
                raise RecomputeOutputError("新增块 date 必须为 YYYY-MM-DD")
            new_blocks.append(block)

    affected_ids = list(dict.fromkeys(affected_ids))

    if bool(affected_ids) != bool(new_blocks):
        raise RecomputeOutputError("受影响块与替代块必须同时出现")

    return RecomputePlan(
        affected_ids=affected_ids,
        new_blocks=new_blocks,
    )


async def plan_recompute(
    trip_id,
    change_desc: str,
    protected: list[BlockSchema],
    mutable: list[BlockSchema],
) -> RecomputePlan:
    user_content = json.dumps(
        {
            "today": date.today().isoformat(),
            "trip_id": str(trip_id),
            "change_desc": change_desc,
            "protected_blocks": [block.model_dump() for block in protected],
            "mutable_blocks": [block.model_dump() for block in mutable],
        },
        ensure_ascii=False,
    )

    result = await generate_model(
        RecomputeResponse,
        RECOMPUTE_SYSTEM_PROMPT,
        user_content,
        max_tokens=8192,
        timeout=120,
    )

    return _build_plan(trip_id, protected, mutable, result)


def apply_recompute(
    db: Session,
    trip_id,
    protected: list[BlockSchema],
    plan: RecomputePlan,
) -> RecomputeResponse:
    try:
        db.rollback()
        with db.begin():
            trip = (
                db.execute(
                    select(Trip)
                    .options(joinedload(Trip.blocks))
                    .where(Trip.id == trip_id)
                )
                .unique()
                .scalar_one_or_none()
            )

            if trip is None:
                raise TripNotFoundError("Trip not found")

            current_blocks = [
                BlockSchema.model_validate(block)
                for block in sorted(trip.blocks, key=_sort_key)
            ]
            current_protected = [
                block for block in current_blocks if block.is_anchor
            ]
            if current_protected != protected:
                raise RecomputeConflictError("锚点已被其他请求修改")

            blocks_by_id = {str(block.id): block for block in trip.blocks}

            for affected_id in plan.affected_ids:
                block = blocks_by_id.get(affected_id)
                if block is None:
                    raise RecomputeConflictError("受影响的块已不存在")
                if block.is_anchor:
                    raise AnchorProtectionError("拒绝修改锚点")
                block.status = "affected"

            new_blocks: list[Block] = []
            for candidate in plan.new_blocks:
                block = Block(
                    day=candidate.day,
                    date=candidate.date,
                    time_slot=candidate.time_slot,
                    activity=candidate.activity,
                    location=candidate.location,
                    is_anchor=False,
                    status="candidate",
                )
                trip.blocks.append(block)
                new_blocks.append(block)

            db.flush()

            changed_ids = list(
                dict.fromkeys(
                    plan.affected_ids
                    + [str(block.id) for block in new_blocks]
                )
            )
            final_blocks = sorted(trip.blocks, key=_sort_key)
            response = RecomputeResponse(
                changed_ids=changed_ids,
                trip_state=TripState(
                    trip_id=trip.id,
                    blocks=[
                        BlockSchema.model_validate(block)
                        for block in final_blocks
                    ],
                ),
                message="已完成局部重算",
            )

        return response
    except (
        TripNotFoundError,
        RecomputeConflictError,
        AnchorProtectionError,
    ):
        raise
    except SQLAlchemyError as error:
        db.rollback()
        raise RecomputePersistenceError("保存行程失败") from error


__all__ = [
    "AnchorProtectionError",
    "RecomputeConflictError",
    "RecomputeError",
    "RecomputeOutputError",
    "RecomputePersistenceError",
    "RecomputePlan",
    "TripNotFoundError",
    "apply_recompute",
    "plan_recompute",
]
