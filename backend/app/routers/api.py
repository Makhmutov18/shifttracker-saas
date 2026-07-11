from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
import io
import openpyxl
from urllib.parse import quote
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

from app.database import get_session
from app.models import User, Shift, Expense, UserRole, ShiftStatus, AuditLog, Adjustment, AdjustmentType
from app.permissions import has_permission
from app.schemas import (
    UserOut, ShiftCreate, ShiftOut, ShiftUpdate,
    ExpenseCreate, ExpenseOut, MonthlyStats,
    AuditLogOut, AdjustmentCreate, AdjustmentOut,
    PayrollSummaryOut, PayrollSummaryRow,
)
from app.auth import ensure_user_is_active, extract_user_from_init_data, validate_init_data
from app.utils import (
    calculate_hours,
    calculate_salary,
    normalize_pay_model,
    safe_decimal,
    safe_text,
    shift_status_label,
)
from app.notifications import notify_shift_approved, notify_shift_rejected, notify_bonus_added, notify_penalty_added

import uuid
import logging

router = APIRouter(prefix="/api", tags=["api"])
logger = logging.getLogger(__name__)


def _can_manage_all_venue_shifts(user: User) -> bool:
    return user.role in (UserRole.owner, UserRole.admin)


def _can_view_team_history_scope(user: User) -> bool:
    return (
        _can_manage_all_venue_shifts(user)
        or has_permission(user, "can_view_team_payroll")
        or has_permission(user, "can_approve_shifts")
        or has_permission(user, "can_edit_team_shifts")
    )


def _can_view_general_audit(user: User) -> bool:
    return user.role in (UserRole.owner, UserRole.admin) or has_permission(user, "can_manage_team")


def _serialize_audit_logs(logs: list[AuditLog]) -> list[AuditLogOut]:
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

    ensure_user_is_active(user)
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
    venue_id: uuid.UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    now = datetime.now(timezone.utc)
    m = month or now.month
    y = year or now.year

    query = (
        select(Shift)
        .outerjoin(User, Shift.user_id == User.id)
        .options(selectinload(Shift.user), selectinload(Shift.venue))
        .where(
            func.extract("month", Shift.date) == m,
            func.extract("year", Shift.date) == y,
        )
    )

    if venue_id is not None and _can_manage_all_venue_shifts(user):
        query = query.where(Shift.venue_id == venue_id)
    elif _can_manage_all_venue_shifts(user):
        pass
    elif _can_view_team_history_scope(user):
        query = query.where(
            or_(
                Shift.venue_id == user.venue_id,
                User.venue_id == user.venue_id,
            )
        )
    else:
        query = query.where(Shift.user_id == user.id)

    query = query.order_by(Shift.date.desc(), Shift.start_time.desc())

    result = await session.execute(query)
    shifts = result.scalars().all()
    return shifts


@router.get("/shifts/pending", response_model=list[ShiftOut])
async def list_pending_shifts(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Admin/senior: list all pending shifts for the venue."""
    if not (has_permission(user, "can_approve_shifts") or has_permission(user, "can_edit_team_shifts")):
        raise HTTPException(status_code=403, detail="Only users with shift approval rights can view pending shifts")

    query = (
        select(Shift)
        .outerjoin(User, Shift.user_id == User.id)
        .options(selectinload(Shift.user), selectinload(Shift.venue))
        .where(Shift.status == "pending")
    )

    if not _can_manage_all_venue_shifts(user):
        query = query.where(
            or_(
                Shift.venue_id == user.venue_id,
                User.venue_id == user.venue_id,
            )
        )

    query = query.order_by(Shift.date.desc(), Shift.start_time.desc())

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
    query = (
        select(Shift)
        .outerjoin(User, Shift.user_id == User.id)
        .where(Shift.id == shift_id)
    )
    if not _can_manage_all_venue_shifts(user):
        query = query.where(
            or_(
                Shift.venue_id == user.venue_id,
                User.venue_id == user.venue_id,
            )
        )

    result = await session.execute(query)
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Only admin/senior can approve/update shifts
    if not (has_permission(user, "can_approve_shifts") or has_permission(user, "can_edit_team_shifts")):
        raise HTTPException(status_code=403, detail="Only users with shift edit rights can update shifts")

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
    venue_id: uuid.UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if not has_permission(user, "can_view_team_payroll"):
        raise HTTPException(status_code=403, detail="Only users with payroll access can view payroll summary")

    now = datetime.now(timezone.utc)
    m = month or now.month
    y = year or now.year

    users_query = select(User).where(User.is_active == True)
    if venue_id is not None and _can_manage_all_venue_shifts(user):
        users_query = users_query.where(User.venue_id == venue_id)
    elif not _can_manage_all_venue_shifts(user):
        users_query = users_query.where(User.venue_id == user.venue_id)
    users_query = users_query.order_by(User.name)

    users_result = await session.execute(users_query)
    scoped_users = users_result.scalars().all()

    shifts_query = (
        select(Shift, User)
        .outerjoin(User, Shift.user_id == User.id)
        .where(
            func.extract("month", Shift.date) == m,
            func.extract("year", Shift.date) == y,
        )
    )
    if venue_id is not None and _can_manage_all_venue_shifts(user):
        shifts_query = shifts_query.where(
            or_(
                Shift.venue_id == venue_id,
                User.venue_id == venue_id,
            )
        )
    elif not _can_manage_all_venue_shifts(user):
        shifts_query = shifts_query.where(
            or_(
                Shift.venue_id == user.venue_id,
                User.venue_id == user.venue_id,
            )
        )
    shifts_query = shifts_query.order_by(User.name, Shift.date)

    shifts_result = await session.execute(shifts_query)
    shifts_with_users = shifts_result.all()

    adjustments_query = (
        select(Adjustment, User)
        .join(User, Adjustment.user_id == User.id)
        .where(
            Adjustment.month == m,
            Adjustment.year == y,
        )
    )
    if venue_id is not None and _can_manage_all_venue_shifts(user):
        adjustments_query = adjustments_query.where(Adjustment.venue_id == venue_id)
    elif not _can_manage_all_venue_shifts(user):
        adjustments_query = adjustments_query.where(
            or_(
                Adjustment.venue_id == user.venue_id,
                User.venue_id == user.venue_id,
            )
        )
    adjustments_query = adjustments_query.order_by(User.name)

    adjustments_result = await session.execute(adjustments_query)
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
        for member in scoped_users
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

    employees_count = sum(1 for row in rows if row.approved_shifts_count > 0)

    return PayrollSummaryOut(
        month=m,
        year=y,
        employees_count=employees_count,
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
    if not _can_view_general_audit(user):
        raise HTTPException(
            status_code=403,
            detail="Общий журнал действий доступен только пользователям с правом управления командой.",
        )

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
    return _serialize_audit_logs(logs)


@router.get("/me/audit-log", response_model=list[AuditLogOut])
async def list_my_audit_log(
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    query = (
        select(AuditLog)
        .options(selectinload(AuditLog.user), selectinload(AuditLog.target_user))
        .where(
            AuditLog.target_user_id == user.id,
            AuditLog.entity_type.in_(("user", "shift")),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(query)
    logs = result.scalars().all()
    return _serialize_audit_logs(logs)


# ─── Adjustments (Bonuses / Penalties) ──────────────────────────────────────

@router.post("/adjustments", response_model=AdjustmentOut)
async def create_adjustment(
    adjustment_data: AdjustmentCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if not has_permission(user, "can_manage_adjustments"):
        raise HTTPException(status_code=403, detail="Only users with adjustment access can create adjustments")

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
    venue_id: uuid.UUID | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Export monthly payroll data as CSV for accounting."""
    if not has_permission(user, "can_export_payroll"):
        raise HTTPException(status_code=403, detail="Only users with payroll export access can export payroll data")

    now = datetime.now(timezone.utc)
    m = month or now.month
    y = year or now.year

    shifts_query = (
        select(Shift, User)
        .outerjoin(User, Shift.user_id == User.id)
        .options(
            selectinload(Shift.venue),
            selectinload(User.venue),
        )
        .where(
            Shift.status == "approved",
            func.extract("month", Shift.date) == m,
            func.extract("year", Shift.date) == y,
        )
    )
    if venue_id is not None and _can_manage_all_venue_shifts(user):
        shifts_query = shifts_query.where(
            or_(
                Shift.venue_id == venue_id,
                User.venue_id == venue_id,
            )
        )
    elif not _can_manage_all_venue_shifts(user):
        shifts_query = shifts_query.where(
            or_(
                Shift.venue_id == user.venue_id,
                User.venue_id == user.venue_id,
            )
        )
    shifts_query = shifts_query.order_by(User.name, Shift.date)
    result = await session.execute(shifts_query)
    shifts_with_users = result.all()

    adj_query = (
        select(Adjustment, User)
        .join(User, Adjustment.user_id == User.id)
        .where(
            Adjustment.month == m,
            Adjustment.year == y,
        )
    )
    if venue_id is not None and _can_manage_all_venue_shifts(user):
        adj_query = adj_query.where(Adjustment.venue_id == venue_id)
    elif not _can_manage_all_venue_shifts(user):
        adj_query = adj_query.where(
            or_(
                Adjustment.venue_id == user.venue_id,
                User.venue_id == user.venue_id,
            )
        )
    adj_result = await session.execute(adj_query)
    adjustments_with_users = adj_result.all()

    adj_by_user: dict[uuid.UUID, dict] = {}
    for adj, adj_user in adjustments_with_users:
        uid = adj.user_id
        if uid not in adj_by_user:
            adj_by_user[uid] = {"bonuses": Decimal("0"), "penalties": Decimal("0")}
        if adj.type == AdjustmentType.bonus:
            adj_by_user[uid]["bonuses"] += adj.amount
        else:
            adj_by_user[uid]["penalties"] += adj.amount

    month_names = [
        "январь",
        "февраль",
        "март",
        "апрель",
        "май",
        "июнь",
        "июль",
        "август",
        "сентябрь",
        "октябрь",
        "ноябрь",
        "декабрь",
    ]
    pay_model_labels = {
        "hourly": "Почасовая",
        "fixed_shift": "Фикс за смену",
        "revenue": "Процент от выручки",
        "hybrid": "Почасовая + процент",
    }
    status_labels = {
        "pending": "На подтверждении",
        "approved": "Утверждена",
        "rejected": "Отклонена",
    }

    period_text = f"{month_names[m - 1].capitalize()} {y}"
    if venue_id is not None and _can_manage_all_venue_shifts(user):
        venue_row = await session.get(Venue, venue_id)
        venue_text = safe_text(getattr(venue_row, "name", None), "Основная точка")
    elif not _can_manage_all_venue_shifts(user):
        venue_text = safe_text(getattr(getattr(user, "venue", None), "name", None), "Основная точка")
    else:
        venue_text = "Все точки"

    def pay_model_label(value) -> str:
        return pay_model_labels.get(normalize_pay_model(value), "Почасовая")

    def status_label(value) -> str:
        return status_labels.get(safe_text(value, "pending"), "Неизвестно")

    def add_title(sheet, columns: int) -> None:
        last_col = get_column_letter(columns)
        sheet.merge_cells(f"A1:{last_col}1")
        sheet.merge_cells(f"A2:{last_col}2")
        sheet["A1"] = "Порядок.Смены — отчёт по выплатам"
        sheet["A2"] = f"Период: {period_text} | Точка: {venue_text}"
        sheet["A1"].font = Font(bold=True, size=14)
        sheet["A1"].alignment = Alignment(horizontal="left", vertical="center")
        sheet["A2"].font = Font(size=11)
        sheet["A2"].alignment = Alignment(horizontal="left", vertical="center")

    def apply_header_row(sheet, row_number: int, headers: list[str]) -> None:
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="2F6BFF", end_color="2F6BFF", fill_type="solid")
        header_align = Alignment(horizontal="center", vertical="center")
        for col, header in enumerate(headers, 1):
            cell = sheet.cell(row=row_number, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align

    def set_formats(sheet, row_number: int, mapping: dict[int, str]) -> None:
        for col, fmt in mapping.items():
            sheet.cell(row=row_number, column=col).number_format = fmt

    def autofit(sheet, start_row: int, widths: dict[int, int]) -> None:
        for col_idx, base_width in widths.items():
            max_len = base_width
            for row_cells in sheet.iter_rows(min_row=start_row, min_col=col_idx, max_col=col_idx):
                value = row_cells[0].value
                if value is None:
                    continue
                max_len = max(max_len, len(str(value)))
            sheet.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 2, 38)

    shift_rows: list[dict[str, object]] = []
    user_totals: dict[uuid.UUID, dict[str, object]] = {}

    for shift, shift_user in shifts_with_users:
        user_name = safe_text(getattr(shift_user, "name", None), "Сотрудник")
        position = safe_text(getattr(shift_user, "position", None), "")
        venue_name = "Основная точка"
        pay_model_value = normalize_pay_model(getattr(shift_user, "pay_model", None) if shift_user is not None else None)

        if shift_user is not None:
            venue_name = safe_text(getattr(getattr(shift_user, "venue", None), "name", None), venue_name)
        shift_venue = getattr(shift, "venue", None)
        if shift_venue is not None:
            venue_name = safe_text(getattr(shift_venue, "name", None), venue_name)
        elif safe_text(getattr(shift, "venue_id", None), "") == "":
            venue_name = "Основная точка"

        total_hours = safe_decimal(getattr(shift, "total_hours", None))
        hourly_rate = safe_decimal(getattr(shift_user, "hourly_rate", None) if shift_user is not None else None)
        revenue = safe_decimal(getattr(shift, "revenue", None))
        rev_pct = safe_decimal(getattr(shift_user, "revenue_percentage", None) if shift_user is not None else None)
        payout = calculate_salary(
            total_hours,
            hourly_rate,
            revenue=revenue if revenue != Decimal("0.00") else None,
            revenue_percentage=rev_pct if rev_pct != Decimal("0.00") else None,
            pay_model=pay_model_value,
        )
        user_id = shift.user_id
        user_adj = adj_by_user.get(user_id, {"bonuses": Decimal("0"), "penalties": Decimal("0")})

        if user_id not in user_totals:
            user_totals[user_id] = {
                "name": user_name,
                "shifts_count": 0,
                "hours": Decimal("0.00"),
                "shift_pay": Decimal("0.00"),
                "bonuses": user_adj["bonuses"],
                "penalties": user_adj["penalties"],
            }
        user_totals[user_id]["shifts_count"] += 1
        user_totals[user_id]["hours"] += total_hours
        user_totals[user_id]["shift_pay"] += payout

        shift_rows.append(
            {
                "employee": user_name,
                "venue": venue_name,
                "position": position,
                "date": getattr(shift, "date", None),
                "start_time": getattr(shift, "start_time", None),
                "end_time": getattr(shift, "end_time", None),
                "hours": total_hours,
                "rate": hourly_rate,
                "revenue": revenue,
                "revenue_percent": rev_pct,
                "pay_model": pay_model_value,
                "status": safe_text(getattr(shift, "status", None), "pending"),
                "payout": payout,
            }
        )


    wb = openpyxl.Workbook()
    ws_shifts = wb.active
    ws_shifts.title = "Смены"
    ws_summary = wb.create_sheet("Сводка")

    shift_headers = [
        "Сотрудник",
        "Точка",
        "Должность",
        "Дата",
        "Начало смены",
        "Конец смены",
        "Часы",
        "Ставка",
        "Выручка",
        "Процент",
        "Модель оплаты",
        "Статус",
        "К выплате",
    ]
    summary_headers = [
        "Сотрудник",
        "Смен",
        "Часы",
        "Начислено за смены",
        "Бонусы",
        "Штрафы",
        "К выплате",
    ]
    russian_months = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь",
    ]

    def style_title(sheet, columns: int) -> None:
        last_col = get_column_letter(columns)
        sheet.merge_cells(f"A1:{last_col}1")
        sheet.merge_cells(f"A2:{last_col}2")
        sheet["A1"] = "Порядок.Смены — отчёт по выплатам"
        sheet["A2"] = f"Период: {russian_months[m - 1]} {y} | Точка: {venue_text}"
        sheet["A1"].font = Font(bold=True, size=14, color="1F2937")
        sheet["A1"].alignment = Alignment(horizontal="left", vertical="center")
        sheet["A2"].font = Font(size=11, color="4B5563")
        sheet["A2"].alignment = Alignment(horizontal="left", vertical="center")
        sheet["A1"].fill = PatternFill(start_color="EEF2FF", end_color="EEF2FF", fill_type="solid")
        sheet["A2"].fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    def apply_header(sheet, row_number: int, headers: list[str]) -> None:
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
        header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        for col, header in enumerate(headers, 1):
            cell = sheet.cell(row=row_number, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align

    def set_row_formats(sheet, row_number: int, mapping: dict[int, str]) -> None:
        for col, fmt in mapping.items():
            sheet.cell(row=row_number, column=col).number_format = fmt

    def autofit(sheet, start_row: int, widths: dict[int, int]) -> None:
        for col_idx, base_width in widths.items():
            max_len = base_width
            for row_cells in sheet.iter_rows(min_row=start_row, min_col=col_idx, max_col=col_idx):
                value = row_cells[0].value
                if value is None:
                    continue
                max_len = max(max_len, len(str(value)))
            sheet.column_dimensions[get_column_letter(col_idx)].width = min(max_len + 2, 40)

    if not shift_rows:
        for sheet, columns in ((ws_shifts, len(shift_headers)), (ws_summary, len(summary_headers))):
            style_title(sheet, columns)
            last_col = get_column_letter(columns)
            sheet.merge_cells(f"A4:{last_col}4")
            sheet["A4"] = "За выбранный период смен нет"
            sheet["A4"].font = Font(italic=True, color="6B7280")
            sheet["A4"].alignment = Alignment(horizontal="center", vertical="center")
            sheet.freeze_panes = "A4"
            sheet.sheet_view.showGridLines = False
            autofit(sheet, start_row=1, widths={1: 24, 2: 18, 3: 18, 4: 14, 5: 14, 6: 14, 7: 14, 8: 14, 9: 14, 10: 12, 11: 20, 12: 16, 13: 16})
    else:
        style_title(ws_shifts, len(shift_headers))
        style_title(ws_summary, len(summary_headers))
        ws_shifts.freeze_panes = "A4"
        ws_summary.freeze_panes = "A4"
        ws_shifts.sheet_view.showGridLines = False
        ws_summary.sheet_view.showGridLines = False

        apply_header(ws_shifts, 3, shift_headers)
        ws_shifts.auto_filter.ref = f"A3:M{3 + len(shift_rows)}"

        row = 4
        for item in shift_rows:
            ws_shifts.cell(row=row, column=1, value=item["employee"])
            ws_shifts.cell(row=row, column=2, value=item["venue"])
            ws_shifts.cell(row=row, column=3, value=item["position"])
            ws_shifts.cell(row=row, column=4, value=item["date"])
            ws_shifts.cell(row=row, column=5, value=item["start_time"])
            ws_shifts.cell(row=row, column=6, value=item["end_time"])
            ws_shifts.cell(row=row, column=7, value=float(item["hours"]))
            ws_shifts.cell(row=row, column=8, value=float(item["rate"]))
            ws_shifts.cell(
                row=row,
                column=9,
                value=float(item["revenue"]) if item["revenue"] != Decimal("0.00") else None,
            )
            ws_shifts.cell(
                row=row,
                column=10,
                value=float(item["revenue_percent"]) if item["revenue_percent"] != Decimal("0.00") else None,
            )
            ws_shifts.cell(row=row, column=11, value=pay_model_label(item["pay_model"]))
            ws_shifts.cell(row=row, column=12, value=status_label(item["status"]))
            ws_shifts.cell(row=row, column=13, value=float(item["payout"]))
            set_row_formats(
                ws_shifts,
                row,
                {
                    4: "dd.mm.yyyy",
                    5: "hh:mm",
                    6: "hh:mm",
                    7: "0.00",
                    8: '#,##0.00 ₽',
                    9: '#,##0.00 ₽',
                    10: '0.00',
                    13: '#,##0.00 ₽',
                },
            )
            row += 1

        apply_header(ws_summary, 3, summary_headers)
        ws_summary.auto_filter.ref = f"A3:G{3 + len(user_totals) + 1}"

        row = 4
        total_shifts = 0
        total_hours = Decimal("0.00")
        total_shift_pay = Decimal("0.00")
        total_bonuses = Decimal("0.00")
        total_penalties = Decimal("0.00")
        for totals in sorted(user_totals.values(), key=lambda item: str(item["name"]).lower()):
            net = totals["shift_pay"] + totals["bonuses"] - totals["penalties"]
            total_shifts += int(totals["shifts_count"])
            total_hours += totals["hours"]
            total_shift_pay += totals["shift_pay"]
            total_bonuses += totals["bonuses"]
            total_penalties += totals["penalties"]
            ws_summary.cell(row=row, column=1, value=totals["name"])
            ws_summary.cell(row=row, column=2, value=int(totals["shifts_count"]))
            ws_summary.cell(row=row, column=3, value=float(totals["hours"]))
            ws_summary.cell(row=row, column=4, value=float(totals["shift_pay"]))
            ws_summary.cell(row=row, column=5, value=float(totals["bonuses"]))
            ws_summary.cell(row=row, column=6, value=float(totals["penalties"]))
            ws_summary.cell(row=row, column=7, value=float(net.quantize(Decimal("0.01"))))
            set_row_formats(
                ws_summary,
                row,
                {
                    2: "0",
                    3: "0.00",
                    4: '#,##0.00 ₽',
                    5: '#,##0.00 ₽',
                    6: '#,##0.00 ₽',
                    7: '#,##0.00 ₽',
                },
            )
            row += 1

        ws_summary.cell(row=row, column=1, value="Итого")
        ws_summary.cell(row=row, column=2, value=total_shifts)
        ws_summary.cell(row=row, column=3, value=float(total_hours))
        ws_summary.cell(row=row, column=4, value=float(total_shift_pay))
        ws_summary.cell(row=row, column=5, value=float(total_bonuses))
        ws_summary.cell(row=row, column=6, value=float(total_penalties))
        ws_summary.cell(
            row=row,
            column=7,
            value=float((total_shift_pay + total_bonuses - total_penalties).quantize(Decimal("0.01"))),
        )
        for col in range(1, 8):
            cell = ws_summary.cell(row=row, column=col)
            cell.font = Font(bold=True)
            cell.fill = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
        set_row_formats(
            ws_summary,
            row,
            {
                2: "0",
                3: "0.00",
                4: '#,##0.00 ₽',
                5: '#,##0.00 ₽',
                6: '#,##0.00 ₽',
                7: '#,##0.00 ₽',
            },
        )

        autofit(
            ws_shifts,
            start_row=3,
            widths={1: 22, 2: 18, 3: 18, 4: 14, 5: 14, 6: 14, 7: 10, 8: 14, 9: 14, 10: 10, 11: 20, 12: 16, 13: 16},
        )
        autofit(
            ws_summary,
            start_row=3,
            widths={1: 22, 2: 10, 3: 10, 4: 16, 5: 12, 6: 12, 7: 14},
        )

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    ascii_filename = f"payroll-{y}-{m:02d}.xlsx"
    russian_filename = f"Порядок.Смены — отчёт по выплатам {russian_months[m - 1].lower()} {y}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_filename}"; '
                f"filename*=UTF-8''{quote(russian_filename)}"
            )
        },
    )

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
