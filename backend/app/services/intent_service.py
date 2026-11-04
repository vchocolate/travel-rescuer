import json
from datetime import date

from pydantic import BaseModel

from ..schemas import BlockSchema, IntentType
from .llm_schema import generate_model

INTENT_SYSTEM_PROMPT = """你是旅行助手的意图路由器。根据当前行程和用户输入，只输出一个 JSON 对象。
可选 intent：
- order：用户提供/粘贴了已确认的酒店、机票、火车票、门票等订单信息，通常包含订单号、确认状态、入住/乘车/入园时间、地址等。订单即使不在当前行程日期内，也选 order，交给订单接口处理。
- schedule：用户要记录一个普通日程、安排、约定或提醒，例如去朋友家、看展、开会、接人。没有订单确认信息，也不需要联网搜索。
- recompute：用户想修改或应对当前行程的变化，例如下雨、下雪、变冷、取消、延误、改期、景点关闭。
- search：用户想获取外部信息、攻略、推荐、附近场所、交通或开放时间，需要联网查询资料。
- clarify：信息不足或无法判断，需要向用户追问。

规则：
1. 结合 trip_blocks 和用户完整语义判断，不要按单个关键词机械分类。
2. 用户说“记一下/安排/提醒我/加到行程”时，优先 schedule；如果内容明显是已确认订单，则选 order。
3. 只是查询天气、攻略、推荐，选 search；要调整当前行程或应对变化，选 recompute。
4. 不得编造行程内容。
5. clarify 时在 message 中给出一句简短追问；其他 intent 的 message 返回 null。
6. 只输出 JSON，不要 Markdown 或解释。"""


class IntentResult(BaseModel):
    intent: IntentType
    message: str | None = None


async def classify_intent(
    text: str,
    blocks: list[BlockSchema],
) -> IntentResult:
    user_content = json.dumps(
        {
            "today": date.today().isoformat(),
            "trip_blocks": [block.model_dump() for block in blocks],
            "user_text": text,
        },
        ensure_ascii=False,
    )
    return await generate_model(
        IntentResult,
        INTENT_SYSTEM_PROMPT,
        user_content,
        max_tokens=512,
        timeout=45,
    )


__all__ = ["IntentResult", "classify_intent"]
