from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
import io
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill

from app.database import get_session
from app.models import User, Shift, Expense, UserRole, ShiftStatus, AuditLog, Adjustment, AdjustmentType
from app.schemas import (
    UserOut, ShiftCreate, ShiftOut, ShiftUpdate,
    ExpenseCreate, ExpenseOut, MonthlyStats,
    AuditLogOut, AdjustmentCreate, AdjustmentOut,
    PayrollSummaryOut, PayrollSummaryRow,
)
from app.auth import validate_init_data, extract_user_from_init_data
from app.utils import calculate_hours, calculate_salary
from app.notifications import notify_shift_approved, notify_shift_rejected, notify_bonus_added, notify_penalty_added

import uuid
import logging

router = APIRouter(prefix="/api", tags=["api"])
logger = logging.getLogger(__name__)


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

    # Baristas and cooks can only create shifts for today or yesterday
    if user.role in (UserRole.barista, UserRole.cook) and shift_data.date < yesterday:
        raise HTTPException(
            status_code=403,
            detail="You can only create shifts for today or yesterday",
        )

    existing_shift_result = await session.execute(
        select(Shift.id).where(
            Shift.user_id == user.id,
            Shift.date == shift_data.date,
            Shift.status.in_(("pending", "approved")),
        )
    )
    existing_shift_id = existing_shift_result.scalar_one_or_none()
    if existing_shift_id:
        raise HTTPException(
            status_code=409,
            detail="Смена за этот день уже создана. Дождитесь подтверждения или обратитесь к администратору.",
        )

    # Calculate hours and salary
    total_hours = calculate_hours(shift_data.start_time, shift_data.end_time)
    salary_earned = calculate_salary(
        total_hours, user.hourly_rate,
        revenue=shift_data.revenue,
        revenue_percentage=user.revenue_percentage,
        pay_model=user.pay_model.value,
    )

    shift = Shift(
        user_id=user.id,
        venue_id=user.venue_id,
        date=shift_data.date,
        start_time=shift_data.start_time,
        end_time=shift_data.end_time,
        cashier_hours=shift_data.cashier_hours,
        total_hours=total_hours,
        salary_earned=salary_earned,
        revenue=shift_data.revenue,
        comment=shift_data.comment,
    )
    session.add(shift)
    await session.commit()
    await session.refresh(shift)

    # Audit logging should not break a successfully saved shift.
    try:
        log = AuditLog(
            user_id=user.id,
            venue_id=user.venue_id,
            action="shift_created",
            entity_type="shift",
            entity_id=shift.id,
            new_value={
                "date": str(shift.date),
                "start_time": str(shift.start_time),
                "end_time": str(shift.end_time),
                "salary": str(shift.salary_earned),
            },
        )
        session.add(log)
        await session.commit()
    except Exception:
        await session.rollback()
        logger.exception("Audit log write failed after successful shift creation", extra={"shift_id": str(shift.id)})

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
    """Admin/senior: list all pending shifts for the venue."""
    if user.role not in (UserRole.owner, UserRole.admin, UserRole.senior):
        raise HTTPException(status_code=403, detail="Only admins/seniors can view pending shifts")

    query = select(Shift).where(
        Shift.venue_id == user.venue_id,
        Shift.status == "pending",
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

    # Only admin/senior can approve/update shifts
    if user.role not in (UserRole.owner, UserRole.admin, UserRole.senior):
        raise HTTPException(status_code=403, detail="Only admins/seniors can update shifts")

    old_status = shift.status

    if shift_data.start_time is not None:
        shift.start_time = shift_data.start_time
    if shift_data.end_time is not None:
        shift.end_time = shift_data.end_time
    if shift_data.cashier_hours is not None:
        shift.cashier_hours = shift_data.cashier_hours
    if shift_data.revenue is not None:
        shift.revenue = shift_data.revenue
    if shift_data.comment is not None:
        shift.comment = shift_data.comment
    if shift_data.status is not None:
        if shift_data.status not in ("pending", "approved", "rejected"):
            raise HTTPException(status_code=400, detail=f"Invalid status: {shift_data.status}")
        old_status = shift.status
        shift.status = shift_data.status

    # Recalculate if times or revenue changed
    if shift_data.start_time is not None or shift_data.end_time is not None or shift_data.revenue is not None:
        shift.total_hours = calculate_hours(shift.start_time, shift.end_time)
        # Get user's pay model
        user_result = await session.get(User, shift.user_id)
        if user_result:
            shift.salary_earned = calculate_salary(
                shift.total_hours, user_result.hourly_rate,
                revenue=shift.revenue or shift_data.revenue,
                revenue_percentage=user_result.revenue_percentage,
                pay_model=user_result.pay_model.value,
            )

    await session.commit()
    await session.refresh(shift)

    # Audit log
    action = "shift_edited"
    if shift_data.status == "approved":
        action = "shift_approved"
    elif shift_data.status == "rejected":
        action = "shift_rejected"

    try:
        log = AuditLog(
            user_id=user.id,
            target_user_id=shift.user_id,
            venue_id=user.venue_id,
            action=action,
            entity_type="shift",
            entity_id=shift.id,
            old_value={"status": old_status} if shift_data.status else None,
            new_value={"status": shift.status, "salary": str(shift.salary_earned)},
        )
        session.add(log)
        await session.commit()
    except Exception:
        await session.rollback()
        logger.exception("Audit log write failed after successful shift update", extra={"shift_id": str(shift.id)})

    # Send notification to shift owner
    if shift_data.status and shift.user_id:
        try:
            shift_owner = await session.get(User, shift.user_id)
            if shift_owner and shift_owner.telegram_id:
                if shift_data.status == "approved":
                    await notify_shift_approved(
                        shift_owner.telegram_id,
                        str(shift.date),
                        str(shift.salary_earned),
                    )
                elif shift_data.status == "rejected":
                    await notify_shift_rejected(
                        shift_owner.telegram_id,
                        str(shift.date),
                        shift_data.comment or "",
                    )
        except Exception:
            logger.exception("Shift notification failed after successful shift update", extra={"shift_id": str(shift.id)})

    return shift


@router.get("/payroll/summary", response_model=PayrollSummaryOut)
async def payroll_summary(
    month: int | None = None,
    year: int | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if user.role not in (UserRole.owner, UserRole.admin, UserRole.senior):
        raise HTTPException(status_code=403, detail="Only admins/seniors can view payroll summary")

    now = datetime.now(timezone.utc)
    m = month or now.month
    y = year or now.year

    users_result = await session.execute(
        select(User)
        .where(User.venue_id == user.venue_id, User.is_active == True)
        .order_by(User.name)
    )
    venue_users = users_result.scalars().all()

    shifts_result = await session.execute(
        select(Shift, User)
        .join(User, Shift.user_id == User.id)
        .where(
            Shift.venue_id == user.venue_id,
            func.extract("month", Shift.date) == m,
            func.extract("year", Shift.date) == y,
        )
        .order_by(User.name, Shift.date)
    )
    shifts_with_users = shifts_result.all()

    adjustments_result = await session.execute(
        select(Adjustment, User)
        .join(User, Adjustment.user_id == User.id)
        .where(
            Adjustment.venue_id == user.venue_id,
            Adjustment.month == m,
            Adjustment.year == y,
        )
        .order_by(User.name)
    )
    adjustments_with_users = adjustments_result.all()

    rows_by_user: dict[uuid.UUID, dict] = {
        member.id: {
            "user_id": member.id,
            "user_name": member.name,
            "approved_shifts_count": 0,
            "total_hours": Decimal("0.00"),
            "shift_payout": Decimal("0.00"),
            "bonuses": Decimal("0.00"),
            "penalties": Decimal("0.00"),
        }
        for member in venue_users
    }

    pending_shifts_count = 0
    approved_shifts_count = 0

    for shift, shift_user in shifts_with_users:
        if shift.status == "pending":
            pending_shifts_count += 1
            continue

        if shift.status != "approved":
            continue

        approved_shifts_count += 1
        row = rows_by_user.setdefault(
            shift.user_id,
            {
                "user_id": shift.user_id,
                "user_name": shift_user.name,
                "approved_shifts_count": 0,
                "total_hours": Decimal("0.00"),
                "shift_payout": Decimal("0.00"),
                "bonuses": Decimal("0.00"),
                "penalties": Decimal("0.00"),
            },
        )
        row["approved_shifts_count"] += 1
        row["total_hours"] += shift.total_hours
        row["shift_payout"] += shift.salary_earned

    for adjustment, adjustment_user in adjustments_with_users:
        row = rows_by_user.setdefault(
            adjustment.user_id,
            {
                "user_id": adjustment.user_id,
                "user_name": adjustment_user.name,
                "approved_shifts_count": 0,
                "total_hours": Decimal("0.00"),
                "shift_payout": Decimal("0.00"),
                "bonuses": Decimal("0.00"),
                "penalties": Decimal("0.00"),
            },
        )
        if adjustment.type == AdjustmentType.bonus:
            row["bonuses"] += adjustment.amount
        else:
            row["penalties"] += adjustment.amount

    rows: list[PayrollSummaryRow] = []
    total_hours = Decimal("0.00")
    total_shift_payout = Decimal("0.00")
    total_bonuses = Decimal("0.00")
    total_penalties = Decimal("0.00")

    for row in rows_by_user.values():
        total_payout = row["shift_payout"] + row["bonuses"] - row["penalties"]
        total_hours += row["total_hours"]
        total_shift_payout += row["shift_payout"]
        total_bonuses += row["bonuses"]
        total_penalties += row["penalties"]

        if (
            row["approved_shifts_count"] == 0
            and row["bonuses"] == Decimal("0.00")
            and row["penalties"] == Decimal("0.00")
        ):
            continue

        rows.append(
            PayrollSummaryRow(
                user_id=row["user_id"],
                user_name=row["user_name"],
                approved_shifts_count=row["approved_shifts_count"],
                total_hours=row["total_hours"],
                shift_payout=row["shift_payout"],
                bonuses=row["bonuses"],
                penalties=row["penalties"],
                total_payout=total_payout,
            )
        )

    rows.sort(key=lambda item: (-item.total_payout, item.user_name.lower()))

    return PayrollSummaryOut(
        month=m,
        year=y,
        employees_count=len(venue_users),
        pending_shifts_count=pending_shifts_count,
        approved_shifts_count=approved_shifts_count,
        total_hours=total_hours,
        total_shift_payout=total_shift_payout,
        total_bonuses=total_bonuses,
        total_penalties=total_penalties,
        total_payout=total_shift_payout + total_bonuses - total_penalties,
        rows=rows,
    )


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
        Shift.status == "approved",
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

    # Bonuses
    bonuses_query = select(
        func.coalesce(func.sum(Adjustment.amount), 0),
    ).where(
        Adjustment.user_id == user.id,
        Adjustment.type == AdjustmentType.bonus,
        Adjustment.month == m,
        Adjustment.year == y,
    )
    bonuses_result = await session.execute(bonuses_query)
    total_bonuses = bonuses_result.scalar() or Decimal("0.00")

    # Penalties
    penalties_query = select(
        func.coalesce(func.sum(Adjustment.amount), 0),
    ).where(
        Adjustment.user_id == user.id,
        Adjustment.type == AdjustmentType.penalty,
        Adjustment.month == m,
        Adjustment.year == y,
    )
    penalties_result = await session.execute(penalties_query)
    total_penalties = penalties_result.scalar() or Decimal("0.00")

    return MonthlyStats(
        total_earned=Decimal(str(total_earned)),
        total_hours=Decimal(str(total_hours)),
        total_cashier_hours=Decimal(str(total_cashier_hours)),
        total_expenses=Decimal(str(total_expenses)),
        total_bonuses=Decimal(str(total_bonuses)),
        total_penalties=Decimal(str(total_penalties)),
        shifts_count=int(shifts_count),
    )


# ─── Audit Logs ─────────────────────────────────────────────────────────────

@router.get("/audit-logs", response_model=list[AuditLogOut])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    offset = (page - 1) * limit

    query = (
        select(AuditLog)
        .options(selectinload(AuditLog.user), selectinload(AuditLog.target_user))
        .where(AuditLog.venue_id == user.venue_id)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await session.execute(query)
    logs = result.scalars().all()

    return [
        AuditLogOut(
            id=log.id,
            user_id=log.user_id,
            target_user_id=log.target_user_id,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            old_value=log.old_value,
            new_value=log.new_value,
            created_at=log.created_at.isoformat() if log.created_at else "",
            user_name=log.user.name if log.user else None,
            target_user_name=log.target_user.name if log.target_user else None,
        )
        for log in logs
    ]


# ─── Adjustments (Bonuses / Penalties) ──────────────────────────────────────

@router.post("/adjustments", response_model=AdjustmentOut)
async def create_adjustment(
    adjustment_data: AdjustmentCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if user.role not in (UserRole.owner, UserRole.admin, UserRole.senior):
        raise HTTPException(status_code=403, detail="Only admins/seniors can create adjustments")

    now = datetime.now(timezone.utc)
    adjustment = Adjustment(
        user_id=adjustment_data.user_id,
        venue_id=user.venue_id,
        type=AdjustmentType(adjustment_data.type),
        amount=adjustment_data.amount,
        reason=adjustment_data.reason,
        created_by=user.id,
        month=now.month,
        year=now.year,
    )
    session.add(adjustment)
    await session.commit()
    await session.refresh(adjustment)

    # Audit log
    log = AuditLog(
        user_id=user.id,
        target_user_id=adjustment_data.user_id,
        venue_id=user.venue_id,
        action=f"{adjustment_data.type}_added",
        entity_type="adjustment",
        entity_id=adjustment.id,
        new_value={"type": adjustment_data.type, "amount": str(adjustment_data.amount), "reason": adjustment_data.reason},
    )
    session.add(log)
    await session.commit()

    # Send notification to target user
    target_user = await session.get(User, adjustment_data.user_id)
    if target_user and target_user.telegram_id:
        if adjustment_data.type == "bonus":
            await notify_bonus_added(
                target_user.telegram_id,
                str(adjustment_data.amount),
                adjustment_data.reason,
            )
        elif adjustment_data.type == "penalty":
            await notify_penalty_added(
                target_user.telegram_id,
                str(adjustment_data.amount),
                adjustment_data.reason,
            )

    return AdjustmentOut(
        id=adjustment.id,
        user_id=adjustment.user_id,
        type=adjustment.type.value,
        amount=adjustment.amount,
        reason=adjustment.reason,
        created_by=adjustment.created_by,
        month=adjustment.month,
        year=adjustment.year,
        created_at=adjustment.created_at.isoformat() if adjustment.created_at else "",
    )


@router.get("/adjustments", response_model=list[AdjustmentOut])
async def list_adjustments(
    month: int | None = None,
    year: int | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    m = month or now.month
    y = year or now.year

    query = (
        select(Adjustment)
        .options(selectinload(Adjustment.user), selectinload(Adjustment.creator))
        .where(
            Adjustment.user_id == user.id,
            Adjustment.month == m,
            Adjustment.year == y,
        )
        .order_by(Adjustment.created_at.desc())
    )
    result = await session.execute(query)
    adjustments = result.scalars().all()

    return [
        AdjustmentOut(
            id=a.id,
            user_id=a.user_id,
            type=a.type.value,
            amount=a.amount,
            reason=a.reason,
            created_by=a.created_by,
            month=a.month,
            year=a.year,
            created_at=a.created_at.isoformat() if a.created_at else "",
            user_name=a.user.name if a.user else None,
            creator_name=a.creator.name if a.creator else None,
        )
        for a in adjustments
    ]


# ─── CSV Export ──────────────────────────────────────────────────────────────

@router.get("/export/xlsx")
async def export_csv(
    month: int | None = None,
    year: int | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Export monthly payroll data as CSV for accounting."""
    if user.role not in (UserRole.owner, UserRole.admin, UserRole.senior):
        raise HTTPException(status_code=403, detail="Only admins/seniors can export payroll data")

    now = datetime.now(timezone.utc)
    m = month or now.month
    y = year or now.year

    # Get all shifts for the venue in this month
    shifts_query = (
        select(Shift, User)
        .join(User, Shift.user_id == User.id)
        .where(
            Shift.venue_id == user.venue_id,
            Shift.status == "approved",
            func.extract("month", Shift.date) == m,
            func.extract("year", Shift.date) == y,
        )
        .order_by(User.name, Shift.date)
    )
    result = await session.execute(shifts_query)
    shifts_with_users = result.all()

    # Get adjustments for this month
    adj_query = (
        select(Adjustment, User)
        .join(User, Adjustment.user_id == User.id)
        .where(
            Adjustment.venue_id == user.venue_id,
            Adjustment.month == m,
            Adjustment.year == y,
        )
    )
    adj_result = await session.execute(adj_query)
    adjustments_with_users = adj_result.all()

    # Build adjustments summary per user
    adj_by_user: dict[uuid.UUID, dict] = {}
    for adj, adj_user in adjustments_with_users:
        uid = adj.user_id
        if uid not in adj_by_user:
            adj_by_user[uid] = {"bonuses": Decimal("0"), "penalties": Decimal("0")}
        if adj.type == AdjustmentType.bonus:
            adj_by_user[uid]["bonuses"] += adj.amount
        else:
            adj_by_user[uid]["penalties"] += adj.amount

    # Build Excel
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Расчёт"

    # Styles
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="2481CC", end_color="2481CC", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center")

    # Headers
    headers = [
        "Сотрудник", "Дата", "Часы", "Ставка/ч", "Выручка", "% от выручки",
        "Модель оплаты", "Итого ЗП"
    ]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align

    user_totals: dict[uuid.UUID, dict] = {}
    row = 2

    for shift, shift_user in shifts_with_users:
        rev_pct = shift_user.revenue_percentage or Decimal("0")
        revenue = shift.revenue or Decimal("0")

        user_adj = adj_by_user.get(shift.user_id, {"bonuses": Decimal("0"), "penalties": Decimal("0")})

        if shift.user_id not in user_totals:
            user_totals[shift.user_id] = {
                "name": shift_user.name,
                "hours": Decimal("0"),
                "salary": Decimal("0"),
                "bonuses": user_adj["bonuses"],
                "penalties": user_adj["penalties"],
            }
        user_totals[shift.user_id]["hours"] += shift.total_hours
        user_totals[shift.user_id]["salary"] += shift.salary_earned

        ws.cell(row=row, column=1, value=shift_user.name)
        ws.cell(row=row, column=2, value=str(shift.date))
        ws.cell(row=row, column=3, value=float(shift.total_hours))
        ws.cell(row=row, column=4, value=float(shift_user.hourly_rate))
        ws.cell(row=row, column=5, value=float(revenue) if revenue else None)
        ws.cell(row=row, column=6, value=float(rev_pct) if rev_pct else None)
        ws.cell(row=row, column=7, value=shift_user.pay_model.value)
        ws.cell(row=row, column=8, value=float(shift.salary_earned))
        row += 1

    # Summary section
    row += 1
    summary_header = ws.cell(row=row, column=1, value="ИТОГО ПО СОТРУДНИКАМ")
    summary_header.font = Font(bold=True, size=12)
    row += 1

    summary_headers = ["Сотрудник", "Всего часов", "ЗП за смены", "Бонусы", "Штрафы", "Итого к выплате"]
    for col, header in enumerate(summary_headers, 1):
        cell = ws.cell(row=row, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="E8F4FD", end_color="E8F4FD", fill_type="solid")
    row += 1

    for uid, totals in user_totals.items():
        net = totals["salary"] + totals["bonuses"] - totals["penalties"]
        ws.cell(row=row, column=1, value=totals["name"])
        ws.cell(row=row, column=2, value=float(totals["hours"]))
        ws.cell(row=row, column=3, value=float(totals["salary"]))
        ws.cell(row=row, column=4, value=float(totals["bonuses"]))
        ws.cell(row=row, column=5, value=float(totals["penalties"]))
        ws.cell(row=row, column=6, value=float(net.quantize(Decimal("0.01"))))
        row += 1

    # Auto-width columns
    for col in ws.columns:
        max_length = 0
        col_letter = col[0].column_letter
        for cell in col:
            if cell.value:
                max_length = max(max_length, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max_length + 2, 30)

    # Save to buffer
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    month_names = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
    ]
    filename = f"raschet_{month_names[m-1]}_{y}.xlsx"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─── Reminders (called by external cron) ─────────────────────────────────────

@router.post("/reminders/shifts")
async def send_shift_reminders(
    session: AsyncSession = Depends(get_session),
):
    """Send reminders to users who haven't logged today's shift. Call via cron at 21:00."""
    from app.notifications import send_shift_reminder
    from app.models import Shift as ShiftModel

    today = date.today()

    # Find all active users in all venues
    users_result = await session.execute(
        select(User).where(User.is_active == True, User.telegram_id.isnot(None))
    )
    all_users = users_result.scalars().all()

    # Find users who already have a shift for today
    shifts_result = await session.execute(
        select(ShiftModel.user_id).where(ShiftModel.date == today)
    )
    users_with_shift = {row[0] for row in shifts_result.all()}

    # Send reminders to users without a shift
    reminded = 0
    for user in all_users:
        if user.id not in users_with_shift and user.telegram_id:
            await send_shift_reminder(user.telegram_id)
            reminded += 1

    return {"reminded": reminded}
