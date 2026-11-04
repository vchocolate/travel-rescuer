import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    blocks: Mapped[list["Block"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )

    @property
    def trip_id(self) -> uuid.UUID:
        return self.id


class Block(Base):
    __tablename__ = "blocks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('normal', 'anchored', 'affected', 'candidate')",
            name="ck_blocks_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    day: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=""
    )
    time_slot: Mapped[str] = mapped_column(String(64), nullable=False)
    activity: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str] = mapped_column(
        String(255), nullable=False, server_default=""
    )
    is_anchor: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), default="normal", server_default="normal", nullable=False
    )

    trip: Mapped["Trip"] = relationship(back_populates="blocks")

    @property
    def block_id(self) -> str:
        return str(self.id)
