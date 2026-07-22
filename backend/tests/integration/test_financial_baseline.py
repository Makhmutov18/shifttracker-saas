from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import (
    Adjustment,
    AdjustmentType,
    PayrollPayment,
    PayrollRun,
    PayrollRunAdjustmentSource,
    PayrollRunItem,
    PayrollRunShiftSource,
    PayrollRunStatus,
    Shift,
)
from app.routers.api import (
    create_payroll_payment,
    create_payroll_run,
    payroll_run_preview,
)
from app.schemas import PayrollPaymentCreate, PayrollRunCreate
from app.utils import calculate_payroll_share, calculate_salary
from tests.fixtures.baseline import PAYMENT_DATE, PERIOD_END, PERIOD_START


pytestmark = pytest.mark.integration
BASELINE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "financial_baseline.json"


def money(value) -> str:
    return str(Decimal(str(value)).quantize(Decimal("0.01")))


@pytest.mark.asyncio
async def test_financial_fixture_matches_reviewed_golden_master(db_session, baseline):
    expected = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    status_rows = await db_session.execute(select(Shift.status, func.count(Shift.id)).group_by(Shift.status))
    shift_counts = {status: count for status, count in status_rows.all()}
    approved_hours, approved_salary = (await db_session.execute(
        select(func.sum(Shift.total_hours), func.sum(Shift.salary_earned)).where(Shift.status == "approved")
    )).one()
    bonus_total = await db_session.scalar(select(func.sum(Adjustment.amount)).where(Adjustment.type == AdjustmentType.bonus))
    deduction_total = await db_session.scalar(select(func.sum(Adjustment.amount)).where(Adjustment.type == AdjustmentType.penalty))
    payment_count, payment_total = (await db_session.execute(
        select(func.count(PayrollPayment.id), func.sum(PayrollPayment.amount))
    )).one()
    source_shifts = await db_session.scalar(select(func.count(PayrollRunShiftSource.id)))
    source_adjustments = await db_session.scalar(select(func.count(PayrollRunAdjustmentSource.id)))

    actual = {
        "period": {"start": PERIOD_START.isoformat(), "end": PERIOD_END.isoformat()},
        "shift_counts": shift_counts,
        "approved_hours": money(approved_hours),
        "approved_salary": money(approved_salary),
        "adjustments": {
            "bonuses": money(bonus_total),
            "deductions": money(deduction_total),
            "net": money(bonus_total - deduction_total),
        },
        "all_venues_payroll_total": money(approved_salary + bonus_total - deduction_total),
        "venue_payroll_run": {
            "total_amount": money(baseline.payroll_run.total_amount),
            "total_paid": money(baseline.payroll_run.total_paid),
            "remaining_amount": money(baseline.payroll_run.total_amount - baseline.payroll_run.total_paid),
            "revenue_total": money(baseline.payroll_run.revenue_total),
            "payroll_share": money(calculate_payroll_share(baseline.payroll_run.total_amount, baseline.payroll_run.revenue_total)),
        },
        "payments": {"count": payment_count, "total": money(payment_total)},
        "sources": {"shifts": source_shifts, "adjustments": source_adjustments},
    }
    assert actual == expected


@pytest.mark.asyncio
async def test_all_pay_models_preserve_exact_current_formula_and_status_eligibility(db_session, baseline):
    assert calculate_salary(Decimal("8"), Decimal("250"), pay_model="hourly") == Decimal("2000.00")
    assert calculate_salary(Decimal("10"), Decimal("1800"), pay_model="fixed_shift") == Decimal("1800.00")
    assert calculate_salary(Decimal("8"), Decimal("0"), Decimal("50000"), Decimal("5"), "revenue") == Decimal("2500.00")
    assert calculate_salary(Decimal("6"), Decimal("300"), Decimal("20000"), Decimal("2"), "hybrid") == Decimal("2200.00")

    preview = await payroll_run_preview(
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        venue_id=None,
        user=baseline.users["owner"],
        session=db_session,
    )
    assert preview.shifts_count == 5
    assert preview.total_hours == Decimal("36.00")
    assert preview.total_base_amount == Decimal("9500.00")
    assert preview.total_bonuses == Decimal("500.00")
    assert preview.total_deductions == Decimal("200.00")
    assert preview.total_amount == Decimal("9800.00")


@pytest.mark.asyncio
async def test_venue_preview_snapshot_and_source_links_are_stable(db_session, baseline):
    preview = await payroll_run_preview(
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        venue_id=baseline.venues["home"].id,
        user=baseline.users["owner"],
        session=db_session,
    )
    assert preview.shifts_count == 4
    assert preview.total_base_amount == Decimal("8500.00")
    assert preview.total_amount == Decimal("8800.00")
    assert len(baseline.payroll_run.shift_sources) == 4
    assert len(baseline.payroll_run.adjustment_sources) == 2

    item_before = await db_session.get(PayrollRunItem, baseline.payroll_run.items[0].id)
    snapshot = (item_before.base_amount, item_before.final_amount, baseline.shifts["hourly_approved"].salary_earned)
    baseline.users["hourly"].hourly_rate = Decimal("9999.00")
    await db_session.commit()
    item_after = await db_session.get(PayrollRunItem, item_before.id)
    shift_after = await db_session.get(Shift, baseline.shifts["hourly_approved"].id)
    assert (item_after.base_amount, item_after.final_amount, shift_after.salary_earned) == snapshot


@pytest.mark.asyncio
async def test_partial_then_full_payments_update_separate_payment_records(db_session, baseline):
    remaining_by_user = {item.user_id: item.remaining_amount for item in baseline.payroll_run.items}
    for user_id, remaining in remaining_by_user.items():
        result = await create_payroll_payment(
            payroll_run_id=baseline.payroll_run.id,
            payment_data=PayrollPaymentCreate(
                user_id=user_id,
                amount=remaining,
                payment_date=PAYMENT_DATE,
                method="cash",
                comment="Golden master settlement",
            ),
            user=baseline.users["owner"],
            session=db_session,
        )

    run = await db_session.get(PayrollRun, baseline.payroll_run.id)
    items = (await db_session.execute(
        select(PayrollRunItem).where(PayrollRunItem.payroll_run_id == run.id)
    )).scalars().all()
    payments = (await db_session.execute(
        select(PayrollPayment).where(PayrollPayment.payroll_run_id == run.id)
    )).scalars().all()
    assert result.status == PayrollRunStatus.paid.value
    assert run.status == PayrollRunStatus.paid
    assert run.total_paid == run.total_amount == Decimal("8800.00")
    assert all(item.remaining_amount == Decimal("0.00") for item in items)
    assert sum((payment.amount for payment in payments), Decimal("0.00")) == Decimal("8800.00")
    assert all(payment.id is not None for payment in payments)


@pytest.mark.asyncio
async def test_period_revenue_is_a_saved_run_value_not_sum_of_shift_revenue(db_session, baseline):
    shift_revenue = await db_session.scalar(
        select(func.sum(Shift.revenue)).where(Shift.venue_id == baseline.venues["home"].id)
    )
    assert shift_revenue == Decimal("70000.00")
    assert baseline.payroll_run.revenue_total == Decimal("40000.00")
    assert calculate_payroll_share(baseline.payroll_run.total_amount, baseline.payroll_run.revenue_total) == Decimal("22.00")

    with pytest.raises(HTTPException) as error:
        await create_payroll_run(
            payroll_data=PayrollRunCreate(
                period_start=PERIOD_START,
                period_end=PERIOD_END,
                venue_id=None,
                revenue_total=Decimal("100000.00"),
            ),
            user=baseline.users["owner"],
            session=db_session,
        )
    assert error.value.status_code == 422
