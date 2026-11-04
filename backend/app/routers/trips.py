from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import InitTripRequest, TripState

router = APIRouter(prefix="/api", tags=["trips"])


@router.post("/init_trip", response_model=TripState)
def init_trip(payload: InitTripRequest, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="POST /api/init_trip 尚未实现",
    )


@router.get("/trip/{trip_id}", response_model=TripState)
def get_trip(trip_id: UUID, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="GET /api/trip/{trip_id} 尚未实现",
    )
