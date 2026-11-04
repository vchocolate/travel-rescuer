import json
import os

import httpx
from pydantic import BaseModel

from ..schemas import SearchResponse
from .llm_schema import generate_model


class SearchEvidence(BaseModel):
    title: str
    url: str
    content: str


class SearchResultBundle(BaseModel):
    results: list[SearchResponse]


class BochaSearchError(RuntimeError):
    pass


class BochaNotConfiguredError(BochaSearchError):
    pass


SEARCH_SYSTEM_PROMPT = """你是行程证据整理器。只根据用户提供的 evidence 提取结构化证据。
规则：
1. 禁止使用 evidence 之外的知识，禁止编造事实、价格、营业时间或来源。
2. 每条结果必须包含 title、url、highlights、pitfalls。
3. title 和 url 必须来自 evidence；highlights 和 pitfalls 用简短中文数组，没有就返回空数组。
4. 如果 evidence 中没有可用信息，results 返回空数组。
5. 只输出 JSON。"""


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
    "SearchEvidence",
    "SearchResultBundle",
    "build_search_results",
    "search_bocha",
]
