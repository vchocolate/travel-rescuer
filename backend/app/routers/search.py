import logging

from fastapi import APIRouter

from ..schemas import SearchRequest, SearchResponse
from ..services.search_service import build_search_results, search_bocha

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["search"])


@router.post("/search", response_model=list[SearchResponse])
async def search(payload: SearchRequest):
    try:
        evidence = await search_bocha(payload.query)
        return await build_search_results(payload.query, evidence)
    except Exception:
        logger.exception("搜索失败，返回空列表")
        return []
