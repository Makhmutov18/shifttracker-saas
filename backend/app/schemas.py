from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, time
from decimal import Decimal
import uuid


# ─── Venue ───────────────────────────────────────────────────────────────────

class VenueOut(BaseModel):
    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


# ─── User ────────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: uuid.UUID
    telegram_id: Optional[int] = None
    name: str
    role: str
    venue_id: uuid.UUID
    hourly_rate: Decimal
    is_active: bool
    venue: Optional[VenueOut] = None

    model_config = {"from_attributes": True}


# ─── Admin ───────────────────────────────────────────────────────────────────

class AdminCreateUser(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(default="barista", pattern="^(barista|admin)$")
    hourly_rate: Decimal = Field(..., ge=0)


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
    comment: Optional[str] = None


class ShiftUpdate(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    cashier_hours: Optional[Decimal] = None
    comment: Optional[str] = None
    status: Optional[str] = None


class ShiftOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    venue_id: uuid.UUID
    date: date
    start_time: time
    end_time: time
    cashier_hours: Optional[Decimal]
    total_hours: Decimal
    salary_earned: Decimal
    status: str
    comment: Optional[str]
    created_at: str

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
    created_at: str

    model_config = {"from_attributes": True}


# ─── Stats ───────────────────────────────────────────────────────────────────

class MonthlyStats(BaseModel):
    total_earned: Decimal = Decimal("0.00")
    total_hours: Decimal = Decimal("0.00")
    total_cashier_hours: Decimal = Decimal("0.00")
    total_expenses: Decimal = Decimal("0.00")
    shifts_count: int = 0