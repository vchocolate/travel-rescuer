from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import EvidenceOut, SearchRequest

router = APIRouter(prefix="/api", tags=["search"])


@router.post("/search", response_model=list[EvidenceOut])
def search(payload: SearchRequest, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="POST /api/search 尚未实现",
    )
