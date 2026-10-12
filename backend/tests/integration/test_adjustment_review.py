from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import Adjustment, AuditLog, PayrollRun, PayrollRunItem, PayrollPayment, PayrollRunStatus


pytestmark = pytest.mark.integration
PATH = "/api/admin/adjustments"
PERIOD = {"month": 6, "year": 2026}


@pytest.mark.asyncio
@pytest.mark.parametrize("actor", ["owner", "admin"])
async def test_owner_admin_can_review_names_and_locked_sources(api_client_factory, baseline, actor):
    async with api_client_factory(baseline.users[actor]) as client:
        response = await client.get(PATH, params=PERIOD)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    for item in data["items"]:
        assert item["user_name"] == "Hourly"
        assert item["venue_name"] == "Baseline Home"
        assert item["creator_name"] == "Owner"
        assert item["date_editable"] is False
        assert item["accrual_date"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("actor", ["hourly", "team_manager", "payroll_viewer"])
async def test_unrelated_permissions_do_not_grant_adjustment_review(api_client_factory, baseline, actor):
    async with api_client_factory(baseline.users[actor]) as client:
        response = await client.get(PATH, params=PERIOD)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_manager_uses_adjustment_venue_not_employee_home(api_client_factory, db_session, baseline):
    manager = baseline.users["team_manager"]
    manager.permissions = {"can_manage_adjustments": True}
    baseline.users["hourly"].venue_id = baseline.venues["cross"].id
    baseline.adjustments["deduction"].venue_id = baseline.venues["cross"].id
    await db_session.commit()
    async with api_client_factory(manager) as client:
        response = await client.get(PATH, params=PERIOD)
        denied = await client.get(PATH, params={**PERIOD, "venue_id": str(baseline.venues["cross"].id)})
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["id"] == str(baseline.adjustments["bonus"].id)
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_unassigned_manager_cannot_get_all_venues(api_client_factory, db_session, baseline):
    manager = baseline.users["team_manager"]
    # Simulate a malformed auth context without violating the database's NOT NULL constraint.
    db_session.expunge(manager)
    manager.permissions = {"can_manage_adjustments": True}
    manager.venue_id = None
    async with api_client_factory(manager) as client:
        assert (await client.get(PATH, params=PERIOD)).status_code == 403


@pytest.mark.asyncio
async def test_filters_pagination_and_archived_venues(api_client_factory, db_session, baseline):
    baseline.adjustments["deduction"].accrual_date = date(2026, 6, 16)
    baseline.venues["home"].is_active = False
    await db_session.commit()
    async with api_client_factory(baseline.users["owner"]) as client:
        undated = await client.get(PATH, params=PERIOD)
        assert undated.json()["total"] == 1
        assert undated.json()["items"][0]["id"] == str(baseline.adjustments["bonus"].id)
        query = {**PERIOD, "undated_only": "false", "per_page": 1}
        first = (await client.get(PATH, params=query)).json()
        second = (await client.get(PATH, params={**query, "page": 2})).json()
        assert first["total"] == second["total"] == 2
        assert first["items"][0]["id"] != second["items"][0]["id"]
        assert (await client.get(PATH, params={**query, "page": 3})).json()["items"] == []
        for filter_ in ({"month": 5}, {"year": 2025}, {"venue_id": str(baseline.venues["cross"].id)}):
            assert (await client.get(PATH, params={**PERIOD, **filter_})).json()["total"] == 0
        archived = await client.get(PATH, params={**PERIOD, "venue_id": str(baseline.venues["home"].id)})
        assert archived.json()["total"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["draft", "finalized", "paid", "cancelled"])
async def test_date_editability_tracks_run_status(api_client_factory, db_session, baseline, status):
    baseline.payroll_run.status = PayrollRunStatus(status)
    await db_session.commit()
    async with api_client_factory(baseline.users["owner"]) as client:
        response = await client.get(PATH, params=PERIOD)
    assert all(item["date_editable"] == (status == "cancelled") for item in response.json()["items"])


@pytest.mark.asyncio
async def test_review_is_read_only_and_personal_endpoint_remains_private(api_client_factory, db_session, baseline):
    before = {model: await db_session.scalar(select(func.count()).select_from(model))
              for model in (Adjustment, AuditLog, PayrollRun, PayrollRunItem, PayrollPayment)}
    async with api_client_factory(baseline.users["owner"]) as client:
        assert (await client.get(PATH, params=PERIOD)).status_code == 200
        assert (await client.get("/api/adjustments", params={**PERIOD, "user_id": str(baseline.users["hourly"].id)})).json() == []
    async with api_client_factory(baseline.users["fixed"]) as client:
        assert (await client.get("/api/adjustments", params={**PERIOD, "user_id": str(baseline.users["hourly"].id)})).json() == []
    async with api_client_factory(baseline.users["hourly"]) as client:
        own = (await client.get("/api/adjustments", params=PERIOD)).json()
        assert len(own) == 2
        assert all(item["user_id"] == str(baseline.users["hourly"].id) for item in own)
        assert all("date_editable" not in item for item in own)
    after = {model: await db_session.scalar(select(func.count()).select_from(model)) for model in before}
    assert before == after
    for adjustment in baseline.adjustments.values():
        await db_session.refresh(adjustment)
        assert adjustment.accrual_date is None
    assert baseline.payroll_run.total_amount == Decimal("8800.00")


@pytest.mark.asyncio
async def test_review_does_not_bypass_patch_reservation_check(api_client_factory, db_session, baseline):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    await db_session.commit()
    async with api_client_factory(baseline.users["owner"]) as client:
        review = (await client.get(PATH, params=PERIOD)).json()
        assert all(item["date_editable"] for item in review["items"])
        baseline.payroll_run.status = PayrollRunStatus.draft
        await db_session.commit()
        response = await client.patch(f"/api/adjustments/{baseline.adjustments['bonus'].id}/accrual-date",
                                      json={"accrual_date": "2026-06-10"})
        assert response.status_code == 409


@pytest.mark.asyncio
async def test_unused_legacy_record_can_be_dated_from_review(api_client_factory, db_session, baseline):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    await db_session.commit()
    async with api_client_factory(baseline.users["owner"]) as client:
        path = f"/api/adjustments/{baseline.adjustments['bonus'].id}/accrual-date"
        assert (await client.patch(path, json={"accrual_date": "2026-06-10"})).status_code == 200
        undated = (await client.get(PATH, params=PERIOD)).json()
        assert undated["total"] == 1
        all_ = (await client.get(PATH, params={**PERIOD, "undated_only": "false"})).json()
    assert all_["total"] == 2
    bonus = next(item for item in all_["items"] if item["type"] == "bonus")
    assert bonus["accrual_date"] == "2026-06-10"
    assert Decimal(bonus["amount"]) == Decimal("500.00")


@pytest.mark.asyncio
@pytest.mark.parametrize("params", [{}, {"month": 13, "year": 2026}, {"month": 6, "year": 0},
                                    {**PERIOD, "page": 0}, {**PERIOD, "per_page": 101}])
async def test_review_validates_period_and_page_bounds(api_client_factory, baseline, params):
    async with api_client_factory(baseline.users["owner"]) as client:
        assert (await client.get(PATH, params=params)).status_code == 422
