import json
import logging
import os
import re
from datetime import date

import httpx
from pydantic import BaseModel, Field

from ..schemas import SearchResponse
from .llm import LLMError
from .llm_schema import generate_model

logger = logging.getLogger(__name__)


class SearchEvidence(BaseModel):
    title: str
    url: str
    content: str


class SearchResultBundle(BaseModel):
    results: list[SearchResponse]


class RewrittenQuery(BaseModel):
    query: str = Field(min_length=1, max_length=200)


class BochaSearchError(RuntimeError):
    pass


class BochaNotConfiguredError(BochaSearchError):
    pass


QUERY_REWRITE_PROMPT = """你是搜索查询改写器。输入是一个 JSON，包含用户原始问题 query，以及可选的当前行程上下文 trip_context。生成一条适合中文搜索引擎的查询。
规则：
1. 必须保留原始问题中的核心地点、对象和真实意图，不要只留下泛化关键词。
2. 可以补充同义词和相关词来提升召回，但不要编造事实。
3. 问交通时补充交通/地铁/公交/路线等词；问避坑时补充缺点/踩雷/体验等词；问门票时补充门票/预约/价格/退改等词。
4. 如果用户原文已经明确提到城市、地点或日期，绝对不能改写成另一个城市或日期。
5. 如果提供了 trip_context，且用户没有明确地点，可以使用 active_day 的 cities/locations 补充目的地；如果用户问“晚上/今天/明天/第二天”等，可以结合 active_date 理解，但不要编造 trip_context 之外的信息。
6. 多城市行程优先使用 active_day 的城市；active_day 没有城市时使用 trip_cities 中唯一城市；仍不确定时不要强行添加城市。
7. 如果没有提供 trip_context，保持原行为，不得擅自添加城市。
8. 只输出 JSON，格式为 {"query": "改写后的查询"}。

示例：
原始问题：沙面岛避坑
输出：{"query": "广州沙面岛避坑 注意事项 缺点 游玩体验"}
原始问题：怎么去沙面岛
输出：{"query": "广州沙面岛 交通 地铁 公交 路线"}
原始问题：买票避坑
输出：{"query": "门票 购票 预约 退改 避坑"}
原始问题：怎么坐地铁
输出：{"query": "地铁 乘车 扫码 购票 换乘 攻略"}
原始问题：晚上去哪逛逛，trip_context 当前在广州
输出：{"query": "广州 晚上 逛街 夜游 推荐 好去处"}"""

CITY_SUFFIX_RE = re.compile(
    r"^([\u4e00-\u9fa5]{2,4}?)(?:市|自治州|地区)"
)
CITY_DISTRICT_RE = re.compile(
    r"^([\u4e00-\u9fa5]{2,3}?)(?:[\u4e00-\u9fa5]{1,4}(?:区|县|镇|街道))"
)
GENERIC_QUERY_RE = re.compile(
    r"^(?:(?:晚上|白天|早上|下午|今天|明天|周末|附近|当地)[，,\s]*)?"
    r"(?:(?:我|我们)?(?:想|可以|能)?(?:去|到)?(?:哪|哪里)"
    r"|有什么(?:好|推荐|好玩|好吃)?|推荐(?:一下)?|逛逛|好玩|吃什么)"
    r"(?:[，,\s]*(?:逛逛|好玩|推荐|的地方|好吃的|吗|呢|呀|吧|？|\?))*$"
)

SEARCH_SYSTEM_PROMPT = """你是行程证据整理器。只根据用户提供的 evidence 提取结构化证据。
规则：
1. 严格围绕用户的原始问题提炼，不要被 evidence 中与原始问题无关的内容带偏。
2. 禁止使用 evidence 之外的知识，禁止编造事实、价格、营业时间或来源。
3. 每条结果必须包含 title、url、highlights、pitfalls。
4. title 和 url 必须来自 evidence；highlights 和 pitfalls 用简短中文数组，没有就返回空数组。
5. 如果 evidence 中没有可用信息，results 返回空数组。
6. 只输出 JSON。"""


def _extract_city(location: str | None) -> str | None:
    value = (location or "").strip()
    if not value:
        return None
    for pattern in (CITY_SUFFIX_RE, CITY_DISTRICT_RE):
        match = pattern.match(value)
        if match:
            return match.group(1)
    return None


def _unique(values) -> list[str]:
    result = []
    seen = set()
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def build_trip_context(blocks) -> dict | None:
    block_list = list(blocks or [])
    if not block_list:
        return None

    dated_blocks = []
    for block in block_list:
        raw_date = getattr(block, "date", None)
        if not raw_date:
            continue
        try:
            parsed_date = date.fromisoformat(raw_date)
        except ValueError:
            continue
        dated_blocks.append((parsed_date, block))

    today = date.today()
    active_date = None
    active_block = None

    if dated_blocks:
        exact = [item for item in dated_blocks if item[0] == today]
        if exact:
            selected = exact[0]
        else:
            future = sorted(
                (item for item in dated_blocks if item[0] > today),
                key=lambda item: item[0],
            )
            if future:
                selected = future[0]
            else:
                selected = max(dated_blocks, key=lambda item: item[0])
        active_date = selected[0].isoformat()
        active_block = selected[1]
    else:
        active_block = min(
            block_list,
            key=lambda block: (block.day, block.time_slot),
        )

    active_day = active_block.day
    active_blocks = [
        block for block in block_list if block.day == active_day
    ]
    if not active_blocks:
        active_blocks = block_list

    active_locations = _unique(
        getattr(block, "location", "") for block in active_blocks
    )
    all_locations = _unique(
        getattr(block, "location", "") for block in block_list
    )
    active_cities = _unique(
        _extract_city(location) for location in active_locations
    )
    all_cities = _unique(
        _extract_city(location) for location in all_locations
    )

    primary_city = None
    if len(active_cities) == 1:
        primary_city = active_cities[0]
    elif not active_cities and len(all_cities) == 1:
        primary_city = all_cities[0]

    return {
        "today": today.isoformat(),
        "active_day": active_day,
        "active_date": active_date,
        "cities": active_cities,
        "trip_cities": all_cities,
        "locations": active_locations,
        "activities": _unique(
            getattr(block, "activity", "") for block in active_blocks
        ),
        "anchor_activities": _unique(
            getattr(block, "activity", "")
            for block in block_list
            if getattr(block, "is_anchor", False)
        ),
        "primary_city": primary_city,
    }


def build_search_fallback(query: str, trip_context: dict | None) -> str:
    original = (query or "").strip()
    if not trip_context or not original:
        return original

    city = trip_context.get("primary_city")
    if not city or city in original:
        return original
    if not GENERIC_QUERY_RE.match(original):
        return original
    return f"{city} {original}"


def _bocha_api_key() -> str:
    return os.getenv("BOCHA_API_KEY", "").strip()


def _bocha_api_url() -> str:
    return os.getenv(
        "BOCHA_API_URL", "https://api.bochaai.com/v1/web-search"
    ).strip()


def _bocha_timeout() -> float:
    try:
        return float(os.getenv("BOCHA_TIMEOUT", "15"))
    except ValueError:
        return 15.0


async def rewrite_search_query(
    query: str,
    trip_context: dict | None = None,
) -> str:
    original = (query or "").strip()
    if not original:
        return original

    user_payload = {"query": original}
    if trip_context:
        user_payload["trip_context"] = trip_context
    user_content = json.dumps(user_payload, ensure_ascii=False)

    try:
        result = await generate_model(
            RewrittenQuery,
            QUERY_REWRITE_PROMPT,
            user_content,
            max_tokens=256,
            timeout=30,
        )
    except LLMError as error:
        logger.warning("搜索 Query 改写失败，使用原查询：%s", type(error).__name__)
        return original
    except Exception:
        logger.exception("搜索 Query 改写异常，使用原查询")
        return original

    rewritten = result.query.strip()
    return rewritten or original


async def search_bocha(query: str) -> list[SearchEvidence]:
    api_key = _bocha_api_key()
    if not api_key:
        raise BochaNotConfiguredError("BOCHA_API_KEY 未配置")

    payload = {
        "query": query,
        "summary": True,
        "count": 3,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=_bocha_timeout()) as client:
            response = await client.post(
                _bocha_api_url(),
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as error:
        raise BochaSearchError(
            f"博查 HTTP {error.response.status_code}"
        ) from error
    except httpx.HTTPError as error:
        raise BochaSearchError(
            f"博查网络错误：{type(error).__name__}"
        ) from error
    except ValueError as error:
        raise BochaSearchError("博查返回非 JSON") from error

    if not isinstance(data, dict):
        raise BochaSearchError("博查返回格式错误")

    data_block = data.get("data")
    if not isinstance(data_block, dict):
        raise BochaSearchError("博查返回缺少 data")

    web_pages = data_block.get("webPages")
    items = web_pages.get("value") if isinstance(web_pages, dict) else []
    if not isinstance(items, list):
        raise BochaSearchError("博查返回 webPages.value 格式错误")

    evidence = []
    for item in items:
        if not isinstance(item, dict):
            continue

        title = str(item.get("name") or item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        content = str(item.get("snippet") or item.get("summary") or "").strip()

        if not title or not url:
            continue

        evidence.append(
            SearchEvidence(title=title, url=url, content=content)
        )

    return evidence


async def build_search_results(
    query: str,
    evidence: list[SearchEvidence],
) -> list[SearchResponse]:
    if not evidence:
        return []

    user_content = json.dumps(
        {
            "query": query,
            "evidence": [item.model_dump() for item in evidence],
        },
        ensure_ascii=False,
    )

    bundle = await generate_model(
        SearchResultBundle,
        SEARCH_SYSTEM_PROMPT,
        user_content,
        max_tokens=4096,
        timeout=90,
    )

    evidence_urls = {item.url for item in evidence}
    return [
        result for result in bundle.results if result.url in evidence_urls
    ]


__all__ = [
    "BochaNotConfiguredError",
    "BochaSearchError",
    "RewrittenQuery",
    "SearchEvidence",
    "SearchResultBundle",
    "build_search_fallback",
    "build_search_results",
    "build_trip_context",
    "rewrite_search_query",
    "search_bocha",
]
