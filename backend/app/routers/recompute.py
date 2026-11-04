from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import RecomputeRequest, RecomputeResponse

router = APIRouter(prefix="/api", tags=["recompute"])


@router.post("/recompute", response_model=RecomputeResponse)
def recompute(payload: RecomputeRequest, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="POST /api/recompute 尚未实现",
    )
