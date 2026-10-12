from datetime import date
from decimal import Decimal
from uuid import uuid4
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select, text

from app import database
from app.database import init_db
from app.models import AuditLog, PayrollPayment, PayrollRun, PayrollRunStatus, PayrollScheduleSettings
from app.routers.api import save_payroll_schedule
from app.schemas import PayrollScheduleUpdate
from tests.integration.test_payroll_concurrency import competing_operations


pytestmark = pytest.mark.integration
PATH = "/api/payroll-schedule"
SETTINGS = {"schedule_type": "twice_monthly", "first_payment_day": 20, "second_payment_day": 5}


def query(baseline, venue="home", month=7, year=2026):
    return {"venue_id": str(baseline.venues[venue].id), "month": month, "year": year}


@pytest.mark.asyncio
async def test_missing_schedule_is_read_only_manual(api_client_factory, db_session, baseline):
    async with api_client_factory(baseline.users["owner"]) as client:
        response = await client.get(PATH, params=query(baseline))
    assert response.status_code == 200
    assert response.json()["schedule_type"] == "manual"
    assert response.json()["periods"] == []
    assert await db_session.scalar(select(func.count()).select_from(PayrollScheduleSettings)) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("actor", ["owner", "admin"])
async def test_management_saves_schedule_and_period_suggestions(api_client_factory, db_session, baseline, actor):
    params = query(baseline)
    async with api_client_factory(baseline.users[actor]) as client:
        response = await client.put(PATH, params={"venue_id": params["venue_id"]}, json=SETTINGS)
        assert response.status_code == 200
        periods = (await client.get(PATH, params=params)).json()["periods"]
        assert periods == [
            {"period_start": "2026-07-01", "period_end": "2026-07-15", "planned_payment_date": "2026-07-20"},
            {"period_start": "2026-07-16", "period_end": "2026-07-31", "planned_payment_date": "2026-08-05"},
        ]
        other = (await client.get(PATH, params=query(baseline, "cross"))).json()
        assert other["schedule_type"] == "manual"
        await client.put(PATH, params=params, json={**SETTINGS, "first_payment_day": 25, "second_payment_day": 10})
        await client.put(PATH, params=params, json={"schedule_type": "manual"})
        assert (await client.get(PATH, params=params)).json()["periods"] == []
    assert await db_session.scalar(select(func.count()).select_from(PayrollScheduleSettings)) == 1
    assert await db_session.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "payroll_schedule_updated")) == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("actor", ["hourly", "team_manager", "payroll_viewer"])
async def test_employee_and_view_only_cannot_change_schedule(api_client_factory, baseline, actor):
    async with api_client_factory(baseline.users[actor]) as client:
        response = await client.put(PATH, params=query(baseline), json=SETTINGS)
        assert response.status_code == 403
        read = await client.get(PATH, params=query(baseline))
        assert read.status_code == (200 if actor == "payroll_viewer" else 403)
        assert (await client.get(PATH, params=query(baseline, "cross"))).status_code == (404 if actor == "payroll_viewer" else 403)


@pytest.mark.asyncio
async def test_admin_explicit_denial_is_respected(api_client_factory, db_session, baseline):
    admin = baseline.users["admin"]
    admin.permissions = {"can_view_team_payroll": False}
    await db_session.commit()
    async with api_client_factory(admin) as client:
        assert (await client.put(PATH, params=query(baseline), json=SETTINGS)).status_code == 403
        assert (await client.get(PATH, params=query(baseline))).status_code == 403


@pytest.mark.asyncio
async def test_unknown_and_archived_venue_are_not_editable(api_client_factory, db_session, baseline):
    baseline.venues["cross"].is_active = False
    await db_session.commit()
    async with api_client_factory(baseline.users["owner"]) as client:
        for venue in (str(uuid4()), str(baseline.venues["cross"].id)):
            assert (await client.put(PATH, params={"venue_id": venue}, json=SETTINGS)).status_code == 404


@pytest.mark.asyncio
async def test_saved_planned_date_is_stable_and_personal_not_payment(api_client_factory, db_session, baseline):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    for adjustment in baseline.adjustments.values():
        adjustment.accrual_date = date(2026, 6, 10)
    await db_session.commit()
    params = query(baseline, month=6)
    async with api_client_factory(baseline.users["owner"]) as client:
        await client.put(PATH, params=params, json=SETTINGS)
        suggestion = (await client.get(PATH, params=params)).json()["periods"][0]
        created = await client.post("/api/payroll-runs", json={**suggestion, "venue_id": params["venue_id"]})
        assert created.status_code == 201
        run = created.json()
        assert run["planned_payment_date"] == "2026-06-20"
        assert run["status"] == "draft"
        assert Decimal(run["total_amount"]) == Decimal("8800.00")
        await client.put(PATH, params=params, json={**SETTINGS, "first_payment_day": 25, "second_payment_day": 10})
        assert (await client.get(f"/api/payroll-runs/{run['id']}")).json()["planned_payment_date"] == "2026-06-20"
        listed = (await client.get("/api/payroll-runs")).json()
        assert next(item for item in listed if item["id"] == run["id"])["planned_payment_date"] == "2026-06-20"
        assert (await client.post(f"/api/payroll-runs/{run['id']}/finalize")).status_code == 200
    async with api_client_factory(baseline.users["hourly"]) as client:
        personal = (await client.get("/api/me/payroll-runs")).json()
        assert len(personal) == 1
        assert personal[0]["planned_payment_date"] == "2026-06-20"
        assert personal[0]["paid_amount"] == "0.00"
        assert personal[0]["payments"] == []
    assert await db_session.scalar(select(func.count()).select_from(PayrollPayment)) == 1


@pytest.mark.asyncio
async def test_legacy_creation_stays_manual_even_with_schedule(api_client_factory, db_session, baseline):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    await db_session.commit()
    async with api_client_factory(baseline.users["owner"]) as client:
        await client.put(PATH, params=query(baseline), json=SETTINGS)
        response = await client.post("/api/payroll-runs", json={"period_start": "2026-06-01", "period_end": "2026-06-30", "venue_id": str(baseline.venues['home'].id)})
    assert response.status_code == 201
    assert response.json()["planned_payment_date"] is None


@pytest.mark.asyncio
async def test_invalid_planned_date_has_no_writes(api_client_factory, db_session, baseline):
    async with api_client_factory(baseline.users["owner"]) as client:
        response = await client.post("/api/payroll-runs", json={"period_start": "2026-06-01", "period_end": "2026-06-15", "planned_payment_date": "2026-06-10"})
    assert response.status_code == 422
    assert await db_session.scalar(select(func.count()).select_from(PayrollRun)) == 1


@pytest.mark.asyncio
async def test_concurrent_first_save_produces_one_schedule(db_session, baseline):
    async def save(session):
        return await save_payroll_schedule(baseline.venues["home"].id, PayrollScheduleUpdate(**SETTINGS),
                                          user=baseline.users["owner"], session=session)
    first, second = await competing_operations(save, save)
    assert first.schedule_type == second.schedule_type == "twice_monthly"
    assert await db_session.scalar(select(func.count()).select_from(PayrollScheduleSettings)) == 1


@pytest.mark.asyncio
async def test_schema_compatibility_is_additive_and_idempotent(db_session, baseline):
    async with database.engine.begin() as connection:
        await connection.execute(text("ALTER TABLE payroll_runs DROP COLUMN planned_payment_date"))
    await init_db()
    await init_db()
    run = await db_session.scalar(select(PayrollRun).execution_options(populate_existing=True))
    assert run.planned_payment_date is None
    assert run.total_amount == Decimal("8800.00")


@pytest.mark.asyncio
async def test_save_failure_rolls_back_settings_and_audit(db_session, baseline):
    venue_id = baseline.venues["home"].id
    with patch.object(db_session, "commit", new=AsyncMock(side_effect=RuntimeError("test failure"))):
        with pytest.raises(RuntimeError, match="test failure"):
            await save_payroll_schedule(venue_id, PayrollScheduleUpdate(**SETTINGS), user=baseline.users["owner"], session=db_session)
    assert await db_session.scalar(select(func.count()).select_from(PayrollScheduleSettings)) == 0
    assert await db_session.scalar(select(func.count()).select_from(AuditLog)) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("data", [
    {"schedule_type": "twice_monthly"}, {**SETTINGS, "first_payment_day": 15},
    {**SETTINGS, "second_payment_day": 16}, {"schedule_type": "percent_advance", "advance_percent": 40},
])
async def test_invalid_settings_do_not_create_records(api_client_factory, db_session, baseline, data):
    async with api_client_factory(baseline.users["owner"]) as client:
        assert (await client.put(PATH, params=query(baseline), json=data)).status_code == 422
    assert await db_session.scalar(select(func.count()).select_from(PayrollScheduleSettings)) == 0
