from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select, text

from app import database
from app.database import init_db
from app.models import Adjustment, AuditLog, PayrollRun, PayrollRunAdjustmentSource, PayrollRunStatus
from app.routers.api import create_payroll_run, update_adjustment_accrual_date
from app.schemas import AdjustmentAccrualDateUpdate, PayrollRunCreate
from tests.integration.test_payroll_concurrency import competing_operations


pytestmark = pytest.mark.integration


def period(start=1, end=30, venue=None):
    return {"period_start": f"2026-06-{start:02d}", "period_end": f"2026-06-{end:02d}", "venue_id": str(venue) if venue else None}


@pytest.mark.asyncio
async def test_two_halves_use_dated_sources_once(api_client_factory, db_session, baseline):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    baseline.adjustments["bonus"].accrual_date = date(2026, 6, 15)
    baseline.adjustments["deduction"].accrual_date = date(2026, 6, 16)
    shift = baseline.shifts["hourly_cross"]
    shift.date = date(2026, 6, 20)
    shift.venue_id = baseline.venues["home"].id
    await db_session.commit()
    venue = baseline.venues["home"].id
    async with api_client_factory(baseline.users["owner"]) as client:
        first = await client.get("/api/payroll-runs/preview", params=period(1, 15, venue))
        second = await client.get("/api/payroll-runs/preview", params=period(16, 30, venue))
        assert first.status_code == second.status_code == 200
        assert Decimal(first.json()["total_bonuses"]) == 500
        assert Decimal(first.json()["total_deductions"]) == 0
        assert Decimal(second.json()["total_bonuses"]) == 0
        assert Decimal(second.json()["total_deductions"]) == 200
        runs = []
        for data, preview in ((period(1, 15, venue), first), (period(16, 30, venue), second)):
            created = await client.post("/api/payroll-runs", json=data)
            assert created.status_code == 201
            assert created.json()["total_amount"] == preview.json()["total_amount"]
            runs.append(created.json())
        assert (await client.post("/api/payroll-runs", json=period(1, 15, venue))).status_code == 409
    sources = (await db_session.scalars(select(PayrollRunAdjustmentSource).join(PayrollRun).where(
        PayrollRun.status == PayrollRunStatus.draft,
    ))).all()
    assert len(sources) == 2
    assert len({source.adjustment_id for source in sources}) == 2
    assert sum(Decimal(run["total_amount"]) for run in runs) == Decimal("9800.00")


@pytest.mark.asyncio
async def test_undated_legacy_blocks_partial_but_preserves_full_month(api_client_factory, db_session, baseline):
    async with api_client_factory(baseline.users["owner"]) as client:
        full = await client.get("/api/payroll-runs/preview", params=period(venue=baseline.venues["home"].id))
        assert full.status_code == 200
        assert Decimal(full.json()["total_amount"]) == Decimal("8800.00")
        for start, end in ((1, 15), (16, 30)):
            params = period(start, end, baseline.venues["home"].id)
            preview = await client.get("/api/payroll-runs/preview", params=params)
            created = await client.post("/api/payroll-runs", json=params)
            assert preview.status_code == created.status_code == 422
            assert "без даты начисления" in preview.json()["detail"]
    assert await db_session.scalar(select(func.count(PayrollRun.id))) == 1
    assert all(adjustment.accrual_date is None for adjustment in baseline.adjustments.values())


@pytest.mark.asyncio
@pytest.mark.parametrize("explicit", [True, False])
async def test_creation_persists_explicit_date_and_legacy_client_stays_compatible(api_client_factory, baseline, explicit):
    data = {"user_id": str(baseline.users["hourly"].id), "venue_id": str(baseline.venues["home"].id),
            "type": "bonus", "amount": "100.00", "reason": "Test bonus"}
    if explicit:
        data["accrual_date"] = "2026-05-12"
    with patch("app.routers.api.notify_bonus_added", new=AsyncMock()):
        async with api_client_factory(baseline.users["owner"]) as client:
            response = await client.post("/api/adjustments", json=data)
    assert response.status_code == 200
    assert response.json()["accrual_date"] == ("2026-05-12" if explicit else None)
    if explicit:
        assert (response.json()["year"], response.json()["month"]) == (2026, 5)


@pytest.mark.asyncio
async def test_dated_adjustments_remain_venue_scoped(api_client_factory, db_session, baseline):
    for adjustment in baseline.adjustments.values():
        adjustment.accrual_date = date(2026, 6, 10)
    async with api_client_factory(baseline.users["owner"]) as client:
        await db_session.commit()
        response = await client.get("/api/payroll-runs/preview", params=period(1, 15, baseline.venues["cross"].id))
    assert response.status_code == 200
    assert Decimal(response.json()["total_bonuses"]) == 0
    assert Decimal(response.json()["total_deductions"]) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["draft", "finalized", "paid"])
async def test_active_snapshot_prevents_date_changes(api_client_factory, db_session, baseline, status):
    baseline.payroll_run.status = PayrollRunStatus(status)
    await db_session.commit()
    adjustment = baseline.adjustments["bonus"]
    async with api_client_factory(baseline.users["owner"]) as client:
        response = await client.patch(f"/api/adjustments/{adjustment.id}/accrual-date", json={"accrual_date": "2026-06-10"})
    assert response.status_code == 409
    await db_session.refresh(adjustment)
    assert adjustment.accrual_date is None
    assert baseline.payroll_run.total_amount == Decimal("8800.00")


@pytest.mark.asyncio
async def test_backfill_after_cancel_is_audited_and_cannot_change_month(api_client_factory, db_session, baseline):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    await db_session.commit()
    adjustment = baseline.adjustments["bonus"]
    path = f"/api/adjustments/{adjustment.id}/accrual-date"
    async with api_client_factory(baseline.users["owner"]) as client:
        assert (await client.patch(path, json={"accrual_date": "2026-07-10"})).status_code == 422
        assert (await client.patch(path, json={"accrual_date": "not-a-date"})).status_code == 422
        response = await client.patch(path, json={"accrual_date": "2026-06-10"})
    assert response.status_code == 200
    assert response.json()["accrual_date"] == "2026-06-10"
    assert response.json()["month"] == 6
    log = await db_session.scalar(select(AuditLog).where(AuditLog.action == "adjustment_date_updated"))
    assert log.old_value == {"accrual_date": None}
    assert log.new_value == {"accrual_date": "2026-06-10"}


@pytest.mark.asyncio
async def test_date_update_permissions_and_scope(api_client_factory, db_session, baseline):
    adjustment = baseline.adjustments["bonus"]
    path = f"/api/adjustments/{adjustment.id}/accrual-date"
    async with api_client_factory(baseline.users["hourly"]) as client:
        assert (await client.patch(path, json={"accrual_date": "2026-06-10"})).status_code == 403
    manager = baseline.users["team_manager"]
    manager.permissions = {"can_manage_adjustments": True}
    manager.venue_id = baseline.venues["cross"].id
    await db_session.commit()
    async with api_client_factory(manager) as client:
        assert (await client.patch(path, json={"accrual_date": "2026-06-10"})).status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("actor", ["admin", "team_manager"])
async def test_authorized_manager_can_date_unused_adjustment(api_client_factory, db_session, baseline, actor):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    user = baseline.users[actor]
    if actor == "team_manager":
        user.permissions = {"can_manage_adjustments": True}
    await db_session.commit()
    adjustment = baseline.adjustments["bonus"]
    async with api_client_factory(user) as client:
        response = await client.patch(f"/api/adjustments/{adjustment.id}/accrual-date", json={"accrual_date": "2026-06-10"})
    assert response.status_code == 200
    assert Decimal(response.json()["amount"]) == Decimal("500.00")


@pytest.mark.asyncio
async def test_cross_month_legacy_requires_full_coverage_of_its_own_month(api_client_factory, baseline):
    async with api_client_factory(baseline.users["owner"]) as client:
        params = {"period_start": "2026-05-16", "period_end": "2026-07-15",
                  "venue_id": str(baseline.venues["home"].id)}
        response = await client.get("/api/payroll-runs/preview", params=params)
        assert response.status_code == 200
        assert Decimal(response.json()["total_bonuses"]) == 500
        params["period_start"] = "2026-06-16"
        assert (await client.get("/api/payroll-runs/preview", params=params)).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("edit_first", [False, True])
async def test_date_edits_serialize_with_snapshot_creation(db_session, baseline, edit_first):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    for adjustment in baseline.adjustments.values():
        adjustment.accrual_date = date(2026, 6, 10)
    await db_session.commit()
    async def create(session):
        return await create_payroll_run(PayrollRunCreate(**period(1, 15, baseline.venues["home"].id)),
                                        user=baseline.users["owner"], session=session)
    async def edit(session):
        return await update_adjustment_accrual_date(baseline.adjustments["bonus"].id,
            AdjustmentAccrualDateUpdate(accrual_date=date(2026, 6, 20)), user=baseline.users["owner"], session=session)
    first, second = await competing_operations(edit if edit_first else create, create if edit_first else edit)
    if edit_first:
        assert first.accrual_date == date(2026, 6, 20)
        assert second.total_amount == Decimal("8300.00")
    else:
        assert first.total_amount == Decimal("8800.00")
        assert second == 409


@pytest.mark.asyncio
async def test_bootstrap_preserves_legacy_null_dates(db_session, baseline):
    async with database.engine.begin() as connection:
        await connection.execute(text("ALTER TABLE adjustments DROP COLUMN accrual_date"))
    await init_db()
    await init_db()
    adjustments = (await db_session.scalars(select(Adjustment).execution_options(populate_existing=True))).all()
    assert len(adjustments) == 2
    assert all(adjustment.accrual_date is None for adjustment in adjustments)
    assert sum(adjustment.amount for adjustment in adjustments) == Decimal("700.00")
