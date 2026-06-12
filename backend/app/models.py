import uuid
from datetime import date, time
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Time,
    Numeric,
    String,
    Text,
    ForeignKey,
    Enum as SAEnum,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base

import enum


class UserRole(str, enum.Enum):
    owner = "owner"
    employee = "employee"


class ShiftStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"


class Venue(Base):
    __tablename__ = "venues"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="venue")
    shifts: Mapped[list["Shift"]] = relationship("Shift", back_populates="venue")
    expenses: Mapped[list["Expense"]] = relationship("Expense", back_populates="venue")

    def __repr__(self) -> str:
        return f"<Venue {self.name}>"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    telegram_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"), nullable=False, default=UserRole.employee
    )
    venue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venues.id"), nullable=False
    )
    hourly_rate: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    auth_code: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, default=lambda: uuid.uuid4().hex[:12]
    )

    # Relationships
    venue: Mapped["Venue"] = relationship("Venue", back_populates="users")
    shifts: Mapped[list["Shift"]] = relationship("Shift", back_populates="user")
    expenses: Mapped[list["Expense"]] = relationship("Expense", back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.name} ({self.role})>"


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    venue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venues.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    cashier_hours: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2), nullable=True, default=Decimal("0.00")
    )
    total_hours: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    salary_earned: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    status: Mapped[ShiftStatus] = mapped_column(
        SAEnum(ShiftStatus, name="shift_status"), nullable=False, default=ShiftStatus.pending
    )
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="shifts")
    venue: Mapped["Venue"] = relationship("Venue", back_populates="shifts")

    def __repr__(self) -> str:
        return f"<Shift {self.date} {self.user_id}>"


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    venue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venues.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="expenses")
    venue: Mapped["Venue"] = relationship("Venue", back_populates="expenses")

    def __repr__(self) -> str:
        return f"<Expense {self.amount} {self.category}>"