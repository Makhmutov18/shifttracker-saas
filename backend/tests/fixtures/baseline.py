from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Adjustment,
    AdjustmentType,
    PayModel,
    PayrollPayment,
    PayrollRun,
    PayrollRunAdjustmentSource,
    PayrollRunItem,
    PayrollRunShiftSource,
    PayrollRunStatus,
    Shift,
    User,
    UserRole,
    Venue,
)
from app.utils import calculate_salary


PERIOD_START = date(2026, 6, 1)
PERIOD_END = date(2026, 6, 30)
PAYMENT_DATE = date(2026, 7, 5)


def uid(value: int) -> UUID:
    return UUID(f"00000000-0000-0000-0000-{value:012d}")


@dataclass(frozen=True)
class BaselineData:
    venues: dict[str, Venue]
    users: dict[str, User]
    shifts: dict[str, Shift]
    adjustments: dict[str, Adjustment]
    payroll_run: PayrollRun


def _user(
    key: int,
    name: str,
    role: UserRole,
    venue: Venue,
    *,
    pay_model: PayModel = PayModel.hourly,
    rate: str = "0.00",
    revenue_percentage: str = "0.00",
    permissions: dict[str, bool] | None = None,
    telegram_id: int | None = None,
    invite_token: str | None = None,
    is_active: bool = True,
) -> User:
    return User(
        id=uid(200 + key),
        telegram_id=telegram_id,
        name=name,
        position="Test position",
        role=role,
        venue_id=venue.id,
        hourly_rate=Decimal(rate),
        revenue_percentage=Decimal(revenue_percentage),
        permissions=permissions or {},
        pay_model=pay_model,
        is_active=is_active,
        invite_token=invite_token,
    )


def _shift(
    key: int,
    user: User,
    venue: Venue,
    work_date: date,
    hours: str,
    status: str,
    *,
    revenue: str | None = None,
) -> Shift:
    revenue_value = Decimal(revenue) if revenue is not None else None
    total_hours = Decimal(hours)
    salary = calculate_salary(
        total_hours,
        user.hourly_rate,
        revenue=revenue_value,
        revenue_percentage=user.revenue_percentage,
        pay_model=user.pay_model.value,
    )
    return Shift(
        id=uid(300 + key),
        user_id=user.id,
        venue_id=venue.id,
        date=work_date,
        start_time=time(9, 0),
        end_time=time(17, 0),
        cashier_hours=Decimal("0.00"),
        total_hours=total_hours,
        salary_earned=salary,
        revenue=revenue_value,
        status=status,
        comment=None,
    )


async def seed_financial_baseline(session: AsyncSession) -> BaselineData:
    venues = {
        "home": Venue(id=uid(101), name="Baseline Home", is_active=True),
        "cross": Venue(id=uid(102), name="Baseline Cross", is_active=True),
    }
    session.add_all(venues.values())
    await session.flush()

    users = {
        "owner": _user(1, "Owner", UserRole.owner, venues["home"], telegram_id=910000001),
        "admin": _user(2, "Admin", UserRole.admin, venues["home"], telegram_id=910000002),
        "senior": _user(3, "Senior", UserRole.senior, venues["home"]),
        "hourly": _user(4, "Hourly", UserRole.barista, venues["home"], rate="250.00"),
        "fixed": _user(5, "Fixed", UserRole.barista, venues["home"], pay_model=PayModel.fixed_shift, rate="1800.00"),
        "revenue": _user(6, "Revenue", UserRole.barista, venues["home"], pay_model=PayModel.revenue, revenue_percentage="5.00"),
        "hybrid": _user(7, "Hybrid", UserRole.barista, venues["home"], pay_model=PayModel.hybrid, rate="300.00", revenue_percentage="2.00"),
        "approver": _user(8, "Approver", UserRole.barista, venues["home"], permissions={"can_approve_shifts": True}),
        "payroll_viewer": _user(9, "Payroll viewer", UserRole.barista, venues["home"], permissions={"can_view_team_payroll": True}),
        "exporter": _user(10, "Exporter", UserRole.barista, venues["home"], permissions={"can_export_payroll": True}),
        "team_manager": _user(11, "Team manager", UserRole.barista, venues["home"], permissions={"can_manage_team": True}),
        "invited": _user(12, "Invited", UserRole.barista, venues["cross"], rate="275.00", invite_token="baseline-invite", is_active=False),
    }
    session.add_all(users.values())
    await session.flush()

    shifts = {
        "hourly_approved": _shift(1, users["hourly"], venues["home"], date(2026, 6, 2), "8.00", "approved"),
        "hourly_pending": _shift(2, users["hourly"], venues["home"], date(2026, 6, 3), "8.00", "pending"),
        "hourly_rejected": _shift(3, users["hourly"], venues["home"], date(2026, 6, 4), "8.00", "rejected"),
        "hourly_cross": _shift(4, users["hourly"], venues["cross"], date(2026, 6, 5), "4.00", "approved"),
        "fixed_approved": _shift(5, users["fixed"], venues["home"], date(2026, 6, 6), "10.00", "approved"),
        "revenue_approved": _shift(6, users["revenue"], venues["home"], date(2026, 6, 7), "8.00", "approved", revenue="50000.00"),
        "hybrid_approved": _shift(7, users["hybrid"], venues["home"], date(2026, 6, 8), "6.00", "approved", revenue="20000.00"),
    }
    session.add_all(shifts.values())
    await session.flush()

    adjustments = {
        "bonus": Adjustment(
            id=uid(401), user_id=users["hourly"].id, venue_id=venues["home"].id,
            type=AdjustmentType.bonus, amount=Decimal("500.00"), reason="Baseline bonus",
            created_by=users["owner"].id, month=6, year=2026,
        ),
        "deduction": Adjustment(
            id=uid(402), user_id=users["hourly"].id, venue_id=venues["home"].id,
            type=AdjustmentType.penalty, amount=Decimal("200.00"), reason="Baseline deduction",
            created_by=users["owner"].id, month=6, year=2026,
        ),
    }
    session.add_all(adjustments.values())
    await session.flush()

    payroll_run = PayrollRun(
        id=uid(501),
        title="June 2026 venue baseline",
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        status=PayrollRunStatus.finalized,
        total_amount=Decimal("8800.00"),
        total_paid=Decimal("1000.00"),
        revenue_total=Decimal("40000.00"),
        created_by_id=users["owner"].id,
        venue_id=venues["home"].id,
        notes="Deterministic integration fixture",
    )
    payroll_run.items = [
        PayrollRunItem(id=uid(510), user_id=users["hourly"].id, approved_shifts_count=1, approved_hours=Decimal("8.00"), base_amount=Decimal("2000.00"), bonus_amount=Decimal("500.00"), deduction_amount=Decimal("200.00"), final_amount=Decimal("2300.00"), paid_amount=Decimal("1000.00"), remaining_amount=Decimal("1300.00")),
        PayrollRunItem(id=uid(511), user_id=users["fixed"].id, approved_shifts_count=1, approved_hours=Decimal("10.00"), base_amount=Decimal("1800.00"), bonus_amount=Decimal("0.00"), deduction_amount=Decimal("0.00"), final_amount=Decimal("1800.00"), paid_amount=Decimal("0.00"), remaining_amount=Decimal("1800.00")),
        PayrollRunItem(id=uid(512), user_id=users["revenue"].id, approved_shifts_count=1, approved_hours=Decimal("8.00"), base_amount=Decimal("2500.00"), bonus_amount=Decimal("0.00"), deduction_amount=Decimal("0.00"), final_amount=Decimal("2500.00"), paid_amount=Decimal("0.00"), remaining_amount=Decimal("2500.00")),
        PayrollRunItem(id=uid(513), user_id=users["hybrid"].id, approved_shifts_count=1, approved_hours=Decimal("6.00"), base_amount=Decimal("2200.00"), bonus_amount=Decimal("0.00"), deduction_amount=Decimal("0.00"), final_amount=Decimal("2200.00"), paid_amount=Decimal("0.00"), remaining_amount=Decimal("2200.00")),
    ]
    payroll_run.shift_sources = [
        PayrollRunShiftSource(id=uid(520 + index), shift_id=shifts[name].id)
        for index, name in enumerate(("hourly_approved", "fixed_approved", "revenue_approved", "hybrid_approved"))
    ]
    payroll_run.adjustment_sources = [
        PayrollRunAdjustmentSource(id=uid(530), adjustment_id=adjustments["bonus"].id),
        PayrollRunAdjustmentSource(id=uid(531), adjustment_id=adjustments["deduction"].id),
    ]
    payroll_run.payments = [
        PayrollPayment(
            id=uid(540), user_id=users["hourly"].id, amount=Decimal("1000.00"),
            payment_date=PAYMENT_DATE, method="cash", comment="Baseline partial payment",
            created_by_id=users["owner"].id,
        )
    ]
    session.add(payroll_run)
    await session.commit()

    return BaselineData(venues, users, shifts, adjustments, payroll_run)
