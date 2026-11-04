import json
import logging
import os

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


QUERY_REWRITE_PROMPT = """你是搜索查询改写器。根据用户的原始问题，生成一条适合中文搜索引擎的查询。
规则：
1. 必须保留原始问题中的核心地点、对象和真实意图，不要只留下泛化关键词。
2. 可以补充同义词和相关词来提升召回，但不要编造事实。
3. 问交通时补充交通/地铁/公交/路线等词；问避坑时补充缺点/踩雷/体验等词；问门票时补充门票/预约/价格/退改等词。
4. 如果核心对象是知名景点且所在城市明确，可以补充城市名来消除歧义。
5. 如果原始问题没有地点，不要擅自添加城市。
6. 只输出 JSON，格式为 {"query": "改写后的查询"}。

示例：
原始问题：沙面岛避坑
输出：{"query": "广州沙面岛避坑 注意事项 缺点 游玩体验"}
原始问题：怎么去沙面岛
输出：{"query": "广州沙面岛 交通 地铁 公交 路线"}
原始问题：买票避坑
输出：{"query": "门票 购票 预约 退改 避坑"}
原始问题：怎么坐地铁
输出：{"query": "地铁 乘车 扫码 购票 换乘 攻略"}"""

SEARCH_SYSTEM_PROMPT = """你是行程证据整理器。只根据用户提供的 evidence 提取结构化证据。
规则：
1. 严格围绕用户的原始问题提炼，不要被 evidence 中与原始问题无关的内容带偏。
2. 禁止使用 evidence 之外的知识，禁止编造事实、价格、营业时间或来源。
3. 每条结果必须包含 title、url、highlights、pitfalls。
4. title 和 url 必须来自 evidence；highlights 和 pitfalls 用简短中文数组，没有就返回空数组。
5. 如果 evidence 中没有可用信息，results 返回空数组。
6. 只输出 JSON。"""


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


async def rewrite_search_query(query: str) -> str:
    original = (query or "").strip()
    if not original:
        return original

    try:
        result = await generate_model(
            RewrittenQuery,
            QUERY_REWRITE_PROMPT,
            original,
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
    "build_search_results",
    "rewrite_search_query",
    "search_bocha",
]
