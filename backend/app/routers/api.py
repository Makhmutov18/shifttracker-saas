from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal

from app.database import get_session
from app.models import User, Shift, Expense, UserRole, ShiftStatus
from app.schemas import (
    UserOut, ShiftCreate, ShiftOut, ShiftUpdate,
    ExpenseCreate, ExpenseOut, MonthlyStats,
)
from app.auth import validate_init_data, extract_user_from_init_data
from app.utils import calculate_hours, calculate_salary, get_current_month_range

import uuid

router = APIRouter(prefix="/api", tags=["api"])


async def get_current_user(
    init_data: str = Header(..., alias="X-Init-Data"),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Dependency: validates initData and returns the authenticated user."""
    if not validate_init_data(init_data):
        raise HTTPException(status_code=401, detail="Invalid init data")

    user_data = extract_user_from_init_data(init_data)
    if not user_data:
        raise HTTPException(status_code=401, detail="User not found in init data")

    telegram_id = user_data.get("id")
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Telegram ID not found")

    result = await session.execute(
        select(User)
        .options(selectinload(User.venue))
        .where(User.telegram_id == int(telegram_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Please start the bot first.")

    return user


# ─── User / Profile ──────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return user


# ─── Shifts ──────────────────────────────────────────────────────────────────

@router.post("/shifts", response_model=ShiftOut)
async def create_shift(
    shift_data: ShiftCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Employees can only create shifts for today or yesterday
    if user.role != UserRole.owner and shift_data.date < yesterday:
        raise HTTPException(
            status_code=403,
            detail="You can only create shifts for today or yesterday",
        )

    # Calculate hours and salary
    total_hours = calculate_hours(shift_data.start_time, shift_data.end_time)
    salary_earned = calculate_salary(total_hours, user.hourly_rate)

    shift = Shift(
        user_id=user.id,
        venue_id=user.venue_id,
        date=shift_data.date,
        start_time=shift_data.start_time,
        end_time=shift_data.end_time,
        cashier_hours=shift_data.cashier_hours,
        total_hours=total_hours,
        salary_earned=salary_earned,
        comment=shift_data.comment,
    )
    session.add(shift)
    await session.commit()
    await session.refresh(shift)
    return shift


@router.get("/shifts", response_model=list[ShiftOut])
async def list_shifts(
    month: int | None = None,
    year: int | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    m = month or now.month
    y = year or now.year

    query = select(Shift).where(
        Shift.user_id == user.id,
        func.extract("month", Shift.date) == m,
        func.extract("year", Shift.date) == y,
    ).order_by(Shift.date.desc(), Shift.start_time.desc())

    result = await session.execute(query)
    shifts = result.scalars().all()
    return shifts


@router.get("/shifts/pending", response_model=list[ShiftOut])
async def list_pending_shifts(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Owner-only: list all pending shifts for the venue."""
    if user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Only owners can view pending shifts")

    query = select(Shift).where(
        Shift.venue_id == user.venue_id,
        Shift.status == ShiftStatus.pending,
    ).order_by(Shift.date.desc(), Shift.start_time.desc())

    result = await session.execute(query)
    shifts = result.scalars().all()
    return shifts


@router.patch("/shifts/{shift_id}", response_model=ShiftOut)
async def update_shift(
    shift_id: uuid.UUID,
    shift_data: ShiftUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Shift).where(Shift.id == shift_id, Shift.venue_id == user.venue_id)
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Only owner can approve/update shifts
    if user.role != UserRole.owner:
        raise HTTPException(status_code=403, detail="Only owners can update shifts")

    if shift_data.start_time is not None:
        shift.start_time = shift_data.start_time
    if shift_data.end_time is not None:
        shift.end_time = shift_data.end_time
    if shift_data.cashier_hours is not None:
        shift.cashier_hours = shift_data.cashier_hours
    if shift_data.comment is not None:
        shift.comment = shift_data.comment
    if shift_data.status is not None:
        shift.status = ShiftStatus(shift_data.status)

    # Recalculate if times changed
    if shift_data.start_time is not None or shift_data.end_time is not None:
        shift.total_hours = calculate_hours(shift.start_time, shift.end_time)
        # Get user's hourly rate
        user_result = await session.get(User, shift.user_id)
        if user_result:
            shift.salary_earned = calculate_salary(shift.total_hours, user_result.hourly_rate)

    await session.commit()
    await session.refresh(shift)
    return shift


# ─── Expenses ────────────────────────────────────────────────────────────────

@router.post("/expenses", response_model=ExpenseOut)
async def create_expense(
    expense_data: ExpenseCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    expense = Expense(
        user_id=user.id,
        venue_id=user.venue_id,
        amount=expense_data.amount,
        category=expense_data.category,
        comment=expense_data.comment,
        date=expense_data.date,
    )
    session.add(expense)
    await session.commit()
    await session.refresh(expense)
    return expense


@router.get("/expenses", response_model=list[ExpenseOut])
async def list_expenses(
    month: int | None = None,
    year: int | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    m = month or now.month
    y = year or now.year

    query = select(Expense).where(
        Expense.user_id == user.id,
        func.extract("month", Expense.date) == m,
        func.extract("year", Expense.date) == y,
    ).order_by(Expense.date.desc())

    result = await session.execute(query)
    expenses = result.scalars().all()
    return expenses


# ─── Stats ───────────────────────────────────────────────────────────────────

@router.get("/stats/monthly", response_model=MonthlyStats)
async def monthly_stats(
    month: int | None = None,
    year: int | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    m = month or now.month
    y = year or now.year

    # Shifts
    shifts_query = select(
        func.coalesce(func.sum(Shift.salary_earned), 0),
        func.coalesce(func.sum(Shift.total_hours), 0),
        func.coalesce(func.sum(Shift.cashier_hours), 0),
        func.count(Shift.id),
    ).where(
        Shift.user_id == user.id,
        func.extract("month", Shift.date) == m,
        func.extract("year", Shift.date) == y,
    )
    shift_result = await session.execute(shifts_query)
    total_earned, total_hours, total_cashier_hours, shifts_count = shift_result.one()

    # Expenses
    expenses_query = select(
        func.coalesce(func.sum(Expense.amount), 0),
    ).where(
        Expense.user_id == user.id,
        func.extract("month", Expense.date) == m,
        func.extract("year", Expense.date) == y,
    )
    expense_result = await session.execute(expenses_query)
    total_expenses = expense_result.scalar() or Decimal("0.00")

    return MonthlyStats(
        total_earned=Decimal(str(total_earned)),
        total_hours=Decimal(str(total_hours)),
        total_cashier_hours=Decimal(str(total_cashier_hours)),
        total_expenses=Decimal(str(total_expenses)),
        shifts_count=int(shifts_count),
    )