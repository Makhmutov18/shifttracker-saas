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
    JSON,
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
    admin = "admin"
    senior = "senior"
    barista = "barista"
    cook = "cook"
    senior_cook = "senior_cook"


class ShiftStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"


class AdjustmentType(str, enum.Enum):
    bonus = "bonus"
    penalty = "penalty"


class PayModel(str, enum.Enum):
    hourly = "hourly"
    fixed_shift = "fixed_shift"
    revenue = "revenue"
    hybrid = "hybrid"


class PayrollRunStatus(str, enum.Enum):
    draft = "draft"
    finalized = "finalized"
    paid = "paid"
    cancelled = "cancelled"


class PayrollScheduleType(str, enum.Enum):
    manual = "manual"
    twice_monthly = "twice_monthly"
    percent_advance = "percent_advance"


class Venue(Base):
    __tablename__ = "venues"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        default=True, server_default="true"
    )

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="venue")
    shifts: Mapped[list["Shift"]] = relationship("Shift", back_populates="venue")
    expenses: Mapped[list["Expense"]] = relationship("Expense", back_populates="venue")
    payroll_runs: Mapped[list["PayrollRun"]] = relationship("PayrollRun", back_populates="venue")
    payroll_schedule_settings: Mapped[list["PayrollScheduleSettings"]] = relationship(
        "PayrollScheduleSettings",
        back_populates="venue",
    )

    def __repr__(self) -> str:
        return f"<Venue {self.name}>"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    telegram_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"), nullable=False, default=UserRole.barista
    )
    venue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venues.id"), nullable=False
    )
    hourly_rate: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    revenue_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    permissions: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict
    )
    pay_model: Mapped[PayModel] = mapped_column(
        SAEnum(PayModel, name="pay_model"), nullable=False, default=PayModel.hourly
    )
    is_active: Mapped[bool] = mapped_column(
        default=False, server_default="false"
    )
    invite_token: Mapped[Optional[str]] = mapped_column(
        String(64), unique=True, nullable=True
    )

    # Relationships
    venue: Mapped["Venue"] = relationship("Venue", back_populates="users")
    shifts: Mapped[list["Shift"]] = relationship("Shift", back_populates="user")
    expenses: Mapped[list["Expense"]] = relationship("Expense", back_populates="user")
    payroll_runs_created: Mapped[list["PayrollRun"]] = relationship(
        "PayrollRun",
        back_populates="created_by_user",
        foreign_keys="PayrollRun.created_by_id",
    )
    payroll_run_items: Mapped[list["PayrollRunItem"]] = relationship(
        "PayrollRunItem",
        back_populates="user",
    )
    payroll_payments_received: Mapped[list["PayrollPayment"]] = relationship(
        "PayrollPayment",
        back_populates="user",
        foreign_keys="PayrollPayment.user_id",
    )
    payroll_payments_created: Mapped[list["PayrollPayment"]] = relationship(
        "PayrollPayment",
        back_populates="created_by_user",
        foreign_keys="PayrollPayment.created_by_id",
    )
    web_sessions: Mapped[list["WebSession"]] = relationship(
        "WebSession", back_populates="user", cascade="all, delete-orphan"
    )

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
    revenue: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending"
    )
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="shifts")
    venue: Mapped["Venue"] = relationship("Venue", back_populates="shifts")
    payroll_run_sources: Mapped[list["PayrollRunShiftSource"]] = relationship(
        "PayrollRunShiftSource", back_populates="shift"
    )

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


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    target_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    venue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venues.id"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    old_value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    new_value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    target_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[target_user_id])
    venue: Mapped["Venue"] = relationship("Venue")

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} by {self.user_id}>"


class Adjustment(Base):
    __tablename__ = "adjustments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    venue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venues.id"), nullable=False
    )
    type: Mapped[AdjustmentType] = mapped_column(
        SAEnum(AdjustmentType, name="adjustment_type"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    month: Mapped[int] = mapped_column(nullable=False)
    year: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    venue: Mapped["Venue"] = relationship("Venue")
    payroll_run_sources: Mapped[list["PayrollRunAdjustmentSource"]] = relationship(
        "PayrollRunAdjustmentSource", back_populates="adjustment"
    )

    def __repr__(self) -> str:
        return f"<Adjustment {self.type} {self.amount} for {self.user_id}>"


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[PayrollRunStatus] = mapped_column(
        SAEnum(PayrollRunStatus, name="payroll_run_status"),
        nullable=False,
        default=PayrollRunStatus.draft,
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    total_paid: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    venue_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venues.id"), nullable=True
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finalized_at: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by_user: Mapped["User"] = relationship(
        "User",
        back_populates="payroll_runs_created",
        foreign_keys=[created_by_id],
    )
    venue: Mapped[Optional["Venue"]] = relationship("Venue", back_populates="payroll_runs")
    items: Mapped[list["PayrollRunItem"]] = relationship(
        "PayrollRunItem",
        back_populates="payroll_run",
        cascade="all, delete-orphan",
    )
    shift_sources: Mapped[list["PayrollRunShiftSource"]] = relationship(
        "PayrollRunShiftSource",
        back_populates="payroll_run",
        cascade="all, delete-orphan",
    )
    adjustment_sources: Mapped[list["PayrollRunAdjustmentSource"]] = relationship(
        "PayrollRunAdjustmentSource",
        back_populates="payroll_run",
        cascade="all, delete-orphan",
    )
    payments: Mapped[list["PayrollPayment"]] = relationship(
        "PayrollPayment",
        back_populates="payroll_run",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<PayrollRun {self.title} {self.period_start}..{self.period_end}>"


class PayrollRunItem(Base):
    __tablename__ = "payroll_run_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payroll_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payroll_runs.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    approved_shifts_count: Mapped[int] = mapped_column(nullable=False, default=0)
    approved_hours: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    base_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    bonus_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    deduction_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    final_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    remaining_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    payroll_run: Mapped["PayrollRun"] = relationship("PayrollRun", back_populates="items")
    user: Mapped["User"] = relationship("User", back_populates="payroll_run_items")

    def __repr__(self) -> str:
        return f"<PayrollRunItem {self.payroll_run_id} {self.user_id}>"


class PayrollRunShiftSource(Base):
    __tablename__ = "payroll_run_shift_sources"
    __table_args__ = (UniqueConstraint("payroll_run_id", "shift_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payroll_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payroll_runs.id"), nullable=False
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shifts.id"), nullable=False
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    payroll_run: Mapped["PayrollRun"] = relationship(
        "PayrollRun", back_populates="shift_sources"
    )
    shift: Mapped["Shift"] = relationship("Shift", back_populates="payroll_run_sources")


class PayrollRunAdjustmentSource(Base):
    __tablename__ = "payroll_run_adjustment_sources"
    __table_args__ = (UniqueConstraint("payroll_run_id", "adjustment_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payroll_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payroll_runs.id"), nullable=False
    )
    adjustment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("adjustments.id"), nullable=False
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    payroll_run: Mapped["PayrollRun"] = relationship(
        "PayrollRun", back_populates="adjustment_sources"
    )
    adjustment: Mapped["Adjustment"] = relationship(
        "Adjustment", back_populates="payroll_run_sources"
    )


class PayrollPayment(Base):
    __tablename__ = "payroll_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payroll_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payroll_runs.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00")
    )
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    method: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    payroll_run: Mapped["PayrollRun"] = relationship("PayrollRun", back_populates="payments")
    user: Mapped["User"] = relationship(
        "User",
        back_populates="payroll_payments_received",
        foreign_keys=[user_id],
    )
    created_by_user: Mapped["User"] = relationship(
        "User",
        back_populates="payroll_payments_created",
        foreign_keys=[created_by_id],
    )

    def __repr__(self) -> str:
        return f"<PayrollPayment {self.amount} for {self.user_id}>"


class PayrollScheduleSettings(Base):
    __tablename__ = "payroll_schedule_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    venue_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venues.id"), nullable=True
    )
    schedule_type: Mapped[PayrollScheduleType] = mapped_column(
        SAEnum(PayrollScheduleType, name="payroll_schedule_type"),
        nullable=False,
        default=PayrollScheduleType.manual,
    )
    first_payment_day: Mapped[Optional[int]] = mapped_column(nullable=True)
    second_payment_day: Mapped[Optional[int]] = mapped_column(nullable=True)
    first_period_rule: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    second_period_rule: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    advance_percent: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[Optional[DateTime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    venue: Mapped[Optional["Venue"]] = relationship(
        "Venue",
        back_populates="payroll_schedule_settings",
    )

    def __repr__(self) -> str:
        return f"<PayrollScheduleSettings {self.schedule_type} venue={self.venue_id}>"


class WebSession(Base):
    __tablename__ = "web_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    csrf_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[Optional[DateTime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[DateTime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped["User"] = relationship("User", back_populates="web_sessions")

    def __repr__(self) -> str:
        return f"<WebSession {self.id} user={self.user_id}>"
