import asyncio
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Trip
from ..schemas import BlockSchema, SearchRequest, SearchResponse
from ..services.search_service import (
    build_search_fallback,
    build_search_results,
    build_trip_context,
    rewrite_search_query,
    search_bocha,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["search"])


@router.post("/search", response_model=list[SearchResponse])
async def search(
    payload: SearchRequest,
    db: Session = Depends(get_db),
):
    trip_context = None
    if payload.trip_id is not None:
        try:
            trip = (
                db.execute(
                    select(Trip)
                    .options(selectinload(Trip.blocks))
                    .where(Trip.id == payload.trip_id)
                )
                .scalar_one_or_none()
            )
            if trip is not None and trip.blocks:
                blocks = sorted(
                    trip.blocks,
                    key=lambda block: (block.day, block.time_slot),
                )
                trip_context = build_trip_context(
                    [BlockSchema.model_validate(block) for block in blocks]
                )
        except SQLAlchemyError:
            logger.exception("读取搜索上下文失败，降级为仅 query")
        except Exception:
            logger.exception("构建搜索上下文失败，降级为仅 query")

    try:
        search_query = await rewrite_search_query(
            payload.query,
            trip_context,
        )
        fallback_query = build_search_fallback(
            payload.query,
            trip_context,
        )
        queries = list(
            dict.fromkeys(
                query.strip()
                for query in (search_query, fallback_query)
                if query and query.strip()
            )
        )

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
