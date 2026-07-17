from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, time, datetime
from decimal import Decimal
import uuid


# ─── Venue ───────────────────────────────────────────────────────────────────

class VenueOut(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool = True

    model_config = {"from_attributes": True}


class VenueCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class VenueUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    is_active: Optional[bool] = None


# ─── User ────────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: uuid.UUID
    telegram_id: Optional[int] = None
    telegram_photo_url: Optional[str] = None
    name: str
    position: Optional[str] = None
    role: str
    venue_id: uuid.UUID
    hourly_rate: Decimal
    revenue_percentage: Decimal = Decimal("0.00")
    permissions: dict[str, bool] = Field(default_factory=dict)
    pay_model: str = "hourly"
    is_active: bool
    venue: Optional[VenueOut] = None

    model_config = {"from_attributes": True}


# ─── Admin ───────────────────────────────────────────────────────────────────

class AdminCreateUser(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=255)
    position: Optional[str] = Field(default=None, max_length=255)
    role: str = Field(default="barista", pattern="^(owner|admin|senior|barista|cook|senior_cook)$")
    venue_id: Optional[uuid.UUID] = None
    hourly_rate: Decimal = Field(default=Decimal("0.00"), ge=0)
    revenue_percentage: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    pay_model: str = Field(default="hourly", pattern="^(hourly|fixed_shift|revenue|hybrid)$")
    permissions: dict[str, bool] = Field(default_factory=dict)


class AdminCreateUserResponse(BaseModel):
    token: str
    invite_link: str
    user_id: uuid.UUID


# ─── Shift ───────────────────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    date: date
    start_time: time
    end_time: time
    cashier_hours: Optional[Decimal] = Field(None, ge=0)
    revenue: Optional[Decimal] = Field(None, ge=0)
    comment: Optional[str] = None
    venue_id: Optional[uuid.UUID] = None


class ShiftUpdate(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    cashier_hours: Optional[Decimal] = None
    revenue: Optional[Decimal] = None
    comment: Optional[str] = None
    status: Optional[str] = None
    venue_id: Optional[uuid.UUID] = None


class ShiftOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    venue_id: uuid.UUID
    venue_name: Optional[str] = None
    date: date
    start_time: time
    end_time: time
    cashier_hours: Optional[Decimal]
    total_hours: Decimal
    salary_earned: Decimal
    revenue: Optional[Decimal] = None
    status: str
    comment: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Expense ─────────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    category: str
    comment: Optional[str] = None
    date: date


class ExpenseOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    venue_id: uuid.UUID
    amount: Decimal
    category: str
    comment: Optional[str]
    date: date
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Stats ───────────────────────────────────────────────────────────────────

class MonthlyStats(BaseModel):
    total_earned: Decimal = Decimal("0.00")
    total_hours: Decimal = Decimal("0.00")
    total_cashier_hours: Decimal = Decimal("0.00")
    total_expenses: Decimal = Decimal("0.00")
    total_bonuses: Decimal = Decimal("0.00")
    total_penalties: Decimal = Decimal("0.00")
    total_payout: Decimal = Decimal("0.00")
    shifts_count: int = 0


class PayrollSummaryRow(BaseModel):
    user_id: uuid.UUID
    user_name: str
    approved_shifts_count: int = 0
    total_hours: Decimal = Decimal("0.00")
    shift_payout: Decimal = Decimal("0.00")
    bonuses: Decimal = Decimal("0.00")
    penalties: Decimal = Decimal("0.00")
    total_payout: Decimal = Decimal("0.00")


class PayrollSummaryOut(BaseModel):
    month: int
    year: int
    employees_count: int = 0
    pending_shifts_count: int = 0
    approved_shifts_count: int = 0
    total_hours: Decimal = Decimal("0.00")
    total_shift_payout: Decimal = Decimal("0.00")
    total_bonuses: Decimal = Decimal("0.00")
    total_penalties: Decimal = Decimal("0.00")
    total_payout: Decimal = Decimal("0.00")
    rows: list[PayrollSummaryRow] = []


# ─── Audit Log ──────────────────────────────────────────────────────────────

class PayrollPreviewRow(BaseModel):
    user_id: uuid.UUID
    user_name: str
    venue_name: str = "Основная точка"
    shifts_count: int = 0
    total_hours: Decimal = Decimal("0.00")
    base_amount: Decimal = Decimal("0.00")
    bonuses: Decimal = Decimal("0.00")
    deductions: Decimal = Decimal("0.00")
    total_amount: Decimal = Decimal("0.00")


class PayrollPreviewOut(BaseModel):
    period_start: date
    period_end: date
    venue_id: Optional[uuid.UUID] = None
    employees_count: int = 0
    shifts_count: int = 0
    total_hours: Decimal = Decimal("0.00")
    total_base_amount: Decimal = Decimal("0.00")
    total_bonuses: Decimal = Decimal("0.00")
    total_deductions: Decimal = Decimal("0.00")
    total_amount: Decimal = Decimal("0.00")
    rows: list[PayrollPreviewRow] = []


class AuditLogOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    target_user_id: Optional[uuid.UUID] = None
    action: str
    entity_type: str
    entity_id: Optional[uuid.UUID] = None
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    created_at: datetime
    user_name: Optional[str] = None
    target_user_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Adjustments ────────────────────────────────────────────────────────────

class AdjustmentCreate(BaseModel):
    user_id: uuid.UUID
    type: str = Field(..., pattern="^(bonus|penalty)$")
    amount: Decimal = Field(..., gt=0)
    reason: str = Field(..., min_length=1, max_length=500)
    venue_id: Optional[uuid.UUID] = None


class AdjustmentOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    venue_id: uuid.UUID
    venue_name: Optional[str] = None
    type: str
    amount: Decimal
    reason: str
    created_by: uuid.UUID
    month: int
    year: int
    created_at: datetime
    user_name: Optional[str] = None
    creator_name: Optional[str] = None

    model_config = {"from_attributes": True}


class VenueStatsRow(BaseModel):
    venue_id: uuid.UUID
    venue_name: str
    is_active: bool
    assigned_employees_count: int = 0
    worked_employees_count: int = 0
    approved_shifts_count: int = 0
    pending_shifts_count: int = 0
    approved_hours: Decimal = Decimal("0.00")
    shift_accruals: Decimal = Decimal("0.00")
    bonuses: Decimal = Decimal("0.00")
    deductions: Decimal = Decimal("0.00")
    total_accruals: Decimal = Decimal("0.00")
    revenue: Decimal = Decimal("0.00")
    payroll_share_percent: Optional[Decimal] = None


# ═════ Payroll Runs ═════

class PayrollRunItemRead(BaseModel):
    id: uuid.UUID
    payroll_run_id: uuid.UUID
    user_id: uuid.UUID
    user_name: Optional[str] = None
    approved_shifts_count: int = 0
    approved_hours: Decimal = Decimal("0.00")
    base_amount: Decimal = Decimal("0.00")
    bonus_amount: Decimal = Decimal("0.00")
    deduction_amount: Decimal = Decimal("0.00")
    final_amount: Decimal = Decimal("0.00")
    paid_amount: Decimal = Decimal("0.00")
    remaining_amount: Decimal = Decimal("0.00")
    created_at: datetime

    model_config = {"from_attributes": True}


class PayrollRunCreate(BaseModel):
    title: Optional[str] = None
    period_start: date
    period_end: date
    venue_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class PayrollPaymentRead(BaseModel):
    id: uuid.UUID
    payroll_run_id: uuid.UUID
    user_id: uuid.UUID
    amount: Decimal
    payment_date: date
    method: Optional[str] = None
    comment: Optional[str] = None
    created_by_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class PayrollPaymentCreate(BaseModel):
    user_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    payment_date: date
    method: Optional[str] = None
    comment: Optional[str] = None


class PayrollPaymentResult(BaseModel):
    payment: PayrollPaymentRead
    user_id: uuid.UUID
    paid_amount: Decimal = Decimal("0.00")
    remaining_amount: Decimal = Decimal("0.00")
    total_paid: Decimal = Decimal("0.00")
    status: str


class PayrollScheduleSettingsRead(BaseModel):
    id: uuid.UUID
    venue_id: Optional[uuid.UUID] = None
    schedule_type: str
    first_payment_day: Optional[int] = None
    second_payment_day: Optional[int] = None
    first_period_rule: Optional[str] = None
    second_period_rule: Optional[str] = None
    advance_percent: Optional[Decimal] = None
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PayrollRunRead(BaseModel):
    id: uuid.UUID
    title: str
    period_start: date
    period_end: date
    status: str
    total_amount: Decimal = Decimal("0.00")
    total_paid: Decimal = Decimal("0.00")
    created_by_id: uuid.UUID
    venue_id: Optional[uuid.UUID] = None
    venue_name: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    finalized_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    notes: Optional[str] = None
    items: list[PayrollRunItemRead] = Field(default_factory=list)
    payments: list[PayrollPaymentRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PayrollRunListItem(BaseModel):
    id: uuid.UUID
    title: str
    period_start: date
    period_end: date
    venue_id: Optional[uuid.UUID] = None
    venue_name: Optional[str] = None
    status: str
    employees_count: int = 0
    total_amount: Decimal = Decimal("0.00")
    total_paid: Decimal = Decimal("0.00")
    created_by_id: uuid.UUID
    created_by_name: Optional[str] = None
    created_at: datetime


class PersonalPayrollPaymentRead(BaseModel):
    amount: Decimal
    payment_date: date
    method: Optional[str] = None
    comment: Optional[str] = None
    created_at: datetime


class PersonalPayrollRunRead(BaseModel):
    payroll_run_id: uuid.UUID
    title: str
    period_start: date
    period_end: date
    venue_name: str
    status: str
    final_amount: Decimal = Decimal("0.00")
    paid_amount: Decimal = Decimal("0.00")
    remaining_amount: Decimal = Decimal("0.00")
    payments: list[PersonalPayrollPaymentRead] = Field(default_factory=list)
