import logging
from enum import StrEnum

from .llm import LLMError, LLMNotConfiguredError, chat_json

logger = logging.getLogger(__name__)


class Intent(StrEnum):
    PLAN = "PLAN"
    SEARCH = "SEARCH"
    ORDER = "ORDER"
    DISRUPTION = "DISRUPTION"
    UNKNOWN = "UNKNOWN"


SYSTEM_PROMPT = """你是行程助手的意图分类器。只判断用户输入属于哪一类，不要回答用户问题。
可选意图：
- PLAN：从零生成行程，或整体重排行程。例如“帮我安排周末广州两日游”。
- SEARCH：询问景点、餐厅、交通、天气、避坑、攻略等需要检索的信息。
- ORDER：粘贴酒店、机票、火车票、门票等订单确认文本，要求识别并锁定。
- DISRUPTION：已有行程后，报告天气、交通、体力、时间等突发变化，要求局部调整。
- UNKNOWN：闲聊、问候、与行程无关、信息不足或无法判断。

判定规则：
1. 订单文本包含“已确认、入住、离店、订单号、航班、车次、门票”等，判 ORDER。
2. 已生成行程后说“下雨了、去不了、改一下、调整户外安排”等，判 DISRUPTION，不要判 PLAN。
3. 只有要求从零生成或整体重排时才判 PLAN。
4. 拿不准就判 UNKNOWN，不要猜。
5. 只输出一行 JSON，不要 Markdown，不要解释。

示例：
输入：帮我安排周末广州两日游，喜欢历史文化
输出：{"intent": "PLAN"}
输入：沙面有什么避坑建议
输出：{"intent": "SEARCH"}
输入：酒店已确认，11月5日入住广州某酒店，离店11月6日
输出：{"intent": "ORDER"}
输入：下午下雨，户外去不了，帮我调整一下
输出：{"intent": "DISRUPTION"}
输入：你好
输出：{"intent": "UNKNOWN"}"""


def _parse_intent(payload: dict) -> Intent:
    if not isinstance(payload, dict):
        return Intent.UNKNOWN

    value = payload.get("intent")
    if not isinstance(value, str):
        return Intent.UNKNOWN

    try:
        return Intent(value.strip().upper())
    except ValueError:
        return Intent.UNKNOWN


async def route_intent(user_input: str) -> Intent:
    text = (user_input or "").strip()
    if not text:
        return Intent.UNKNOWN

    try:
        payload = await chat_json(
            SYSTEM_PROMPT,
            text[:4000],
            max_tokens=1024,
            timeout=60,
        )
    except LLMNotConfiguredError:
        logger.warning("LLM_API_KEY 未配置，意图识别返回 UNKNOWN")
        return Intent.UNKNOWN
    except LLMError as error:
        logger.warning("意图识别失败：%s", error)
        return Intent.UNKNOWN
    except Exception:
        logger.exception("意图识别调用异常")
        return Intent.UNKNOWN

    return _parse_intent(payload)


__all__ = ["Intent", "route_intent"]
