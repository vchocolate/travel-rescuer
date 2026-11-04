import asyncio
import logging

from fastapi import APIRouter

from ..schemas import SearchRequest, SearchResponse
from ..services.search_service import (
    build_search_results,
    rewrite_search_query,
    search_bocha,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["search"])


@router.post("/search", response_model=list[SearchResponse])
async def search(payload: SearchRequest):
    try:
        search_query = await rewrite_search_query(payload.query)
        queries = [search_query]
        if search_query.strip() != payload.query.strip():
            queries.append(payload.query)

        batches = await asyncio.gather(
            *(search_bocha(query) for query in queries),
            return_exceptions=True,
        )

        evidence = []
        seen_urls = set()
        for batch in batches:
            if isinstance(batch, Exception):
                logger.warning(
                    "博查查询失败：%s", type(batch).__name__
                )
                continue
            for item in batch:
                if item.url in seen_urls:
                    continue
                seen_urls.add(item.url)
                evidence.append(item)

        return await build_search_results(payload.query, evidence)
    except Exception:
        logger.exception("搜索失败，返回空列表")
        return []
