from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.permissions import PERMISSION_KEYS, has_permission
from app.routers import admin
from app.routers.api import (
    _get_export_report,
    list_my_payroll_runs,
    list_shifts,
    list_venue_stats,
    monthly_stats,
    payroll_run_preview,
    payroll_summary,
    update_shift,
)
from app.schemas import ShiftUpdate
from tests.fixtures.baseline import PERIOD_END, PERIOD_START


pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_home_venue_actual_work_venue_and_personal_accruals_remain_distinct(db_session, baseline):
    hourly = baseline.users["hourly"]
    assert hourly.venue_id == baseline.venues["home"].id
    assert baseline.shifts["hourly_cross"].venue_id == baseline.venues["cross"].id

    personal = await monthly_stats(month=6, year=2026, user=hourly, session=db_session)
    assert personal.shifts_count == 2
    assert personal.total_hours == Decimal("12.00")
    assert personal.total_earned == Decimal("3000.00")
    assert personal.total_bonuses == Decimal("500.00")
    assert personal.total_penalties == Decimal("200.00")
    assert personal.total_payout == Decimal("3300.00")

    own_shifts = await list_shifts(month=6, year=2026, venue_id=None, user=hourly, session=db_session)
    assert {shift.id for shift in own_shifts} == {
        baseline.shifts["hourly_approved"].id,
        baseline.shifts["hourly_pending"].id,
        baseline.shifts["hourly_rejected"].id,
        baseline.shifts["hourly_cross"].id,
    }


@pytest.mark.asyncio
async def test_venue_reports_scope_only_by_actual_shift_venue(db_session, baseline):
    rows = await list_venue_stats(
        month=6,
        year=2026,
        include_inactive=False,
        user=baseline.users["owner"],
        session=db_session,
    )
    by_id = {row.venue_id: row for row in rows}
    home = by_id[baseline.venues["home"].id]
    cross = by_id[baseline.venues["cross"].id]

    assert home.approved_shifts_count == 4
    assert home.shift_accruals == Decimal("8500.00")
    assert home.total_accruals == Decimal("8800.00")
    assert cross.approved_shifts_count == 1
    assert cross.shift_accruals == Decimal("1000.00")
    assert cross.total_accruals == Decimal("1000.00")

    cross_preview = await payroll_run_preview(
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        venue_id=baseline.venues["cross"].id,
        user=baseline.users["owner"],
        session=db_session,
    )
    assert cross_preview.shifts_count == 1
    assert cross_preview.total_base_amount == Decimal("1000.00")


@pytest.mark.asyncio
async def test_current_permission_matrix_and_management_denials(db_session, baseline):
    ordinary = baseline.users["hourly"]
    owner = baseline.users["owner"]
    admin_user = baseline.users["admin"]
    senior = baseline.users["senior"]

    assert all(has_permission(owner, key) for key in PERMISSION_KEYS)
    assert all(has_permission(admin_user, key) for key in PERMISSION_KEYS)
    assert has_permission(senior, "can_approve_shifts")
    assert not has_permission(senior, "can_view_team_payroll")
    assert has_permission(baseline.users["approver"], "can_approve_shifts")
    assert has_permission(baseline.users["payroll_viewer"], "can_view_team_payroll")
    assert has_permission(baseline.users["exporter"], "can_export_payroll")
    assert admin._can_manage_team_access(baseline.users["team_manager"])

    with pytest.raises(HTTPException) as payroll_error:
        await payroll_summary(month=6, year=2026, venue_id=None, user=ordinary, session=db_session)
    assert payroll_error.value.status_code == 403

    with pytest.raises(HTTPException) as export_error:
        await _get_export_report(month=6, year=2026, venue_id=None, user=ordinary, session=db_session)
    assert export_error.value.status_code == 403

    with pytest.raises(HTTPException) as edit_error:
        await update_shift(
            shift_id=baseline.shifts["fixed_approved"].id,
            shift_data=ShiftUpdate(status="rejected"),
            user=ordinary,
            session=db_session,
        )
    assert edit_error.value.status_code == 403


@pytest.mark.asyncio
async def test_http_payroll_permission_boundary(api_client_factory, baseline):
    async with api_client_factory(baseline.users["hourly"]) as client:
        denied = await client.get("/api/payroll/summary", params={"month": 6, "year": 2026})
    assert denied.status_code == 403

    async with api_client_factory(baseline.users["owner"]) as client:
        allowed = await client.get("/api/payroll/summary", params={"month": 6, "year": 2026})
    assert allowed.status_code == 200
    assert allowed.json()["total_payout"] == "9800.00"


@pytest.mark.asyncio
async def test_approver_payroll_viewer_and_exporter_keep_current_capabilities(db_session, baseline):
    with pytest.raises(HTTPException) as cross_venue_error:
        await update_shift(
            shift_id=baseline.shifts["hourly_cross"].id,
            shift_data=ShiftUpdate(status="rejected"),
            user=baseline.users["approver"],
            session=db_session,
        )
    assert cross_venue_error.value.status_code == 404

    approved = await update_shift(
        shift_id=baseline.shifts["hourly_pending"].id,
        shift_data=ShiftUpdate(status="approved"),
        user=baseline.users["approver"],
        session=db_session,
    )
    assert approved.status == "approved"

    preview = await payroll_run_preview(
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        venue_id=None,
        user=baseline.users["payroll_viewer"],
        session=db_session,
    )
    assert preview.venue_id is None
    assert preview.total_base_amount == Decimal("10500.00")

    report = await _get_export_report(
        month=6,
        year=2026,
        venue_id=baseline.venues["cross"].id,
        user=baseline.users["exporter"],
        session=db_session,
    )
    assert report.venue_name == baseline.venues["home"].name
    assert all(row["work_venue"] == baseline.venues["home"].name for row in report.shifts)


@pytest.mark.asyncio
async def test_employee_payroll_history_does_not_expose_management_revenue(db_session, baseline):
    rows = await list_my_payroll_runs(user=baseline.users["hourly"], session=db_session)
    assert len(rows) == 1
    payload = rows[0].model_dump()
    assert payload["final_amount"] == Decimal("2300.00")
    assert "revenue_total" not in payload
    assert "payroll_share" not in payload
