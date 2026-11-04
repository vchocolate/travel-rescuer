from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import BlockOut, ParseOrderRequest

router = APIRouter(prefix="/api", tags=["orders"])


@router.post("/parse_order", response_model=BlockOut)
def parse_order(payload: ParseOrderRequest, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="POST /api/parse_order 尚未实现",
    )
