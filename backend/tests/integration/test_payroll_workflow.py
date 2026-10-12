from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.models import PayrollPayment, PayrollRun, PayrollRunAdjustmentSource, PayrollRunItem, PayrollRunShiftSource


pytestmark = pytest.mark.integration


def result(response, status=200):
    assert response.status_code == status, response.text
    return response.json()


async def submit_shift(client, work_date, venue_id):
    class Workday(date):
        @classmethod
        def today(cls):
            return date.fromisoformat(work_date)

    # Only the today/yesterday submission window is frozen; earnings use real application code.
    with patch("app.routers.api.date", Workday):
        return await client.post("/api/shifts", json={
            "date": work_date, "start_time": "09:00", "end_time": "17:00",
            "revenue": "12000.00", "venue_id": venue_id,
        })


async def counts(session):
    return tuple([await session.scalar(select(func.count()).select_from(model)) for model in (
        PayrollRun, PayrollRunItem, PayrollRunShiftSource, PayrollRunAdjustmentSource, PayrollPayment,
    )])


@pytest.mark.asyncio
@pytest.mark.parametrize("actor,base", [("hourly", "2000.00"), ("fixed", "1800.00"), ("revenue", "600.00"), ("hybrid", "2640.00")])
@pytest.mark.parametrize("first_day,second_day", [(20, 5), (25, 10)])
async def test_two_half_months_from_shift_submission_to_personal_payments(
    api_client_factory, db_session, baseline, actor, base, first_day, second_day,
):
    employee = baseline.users[actor]
    employee_id = str(employee.id)
    home, cross = str(baseline.venues["home"].id), str(baseline.venues["cross"].id)
    shifts = {}
    async with api_client_factory(employee) as client:
        for day, venue in ((15, home), (16, home), (31, home), (14, home), (13, home), (12, cross)):
            shift = result(await submit_shift(client, f"2026-07-{day:02d}", venue))
            assert shift["status"] == "pending"
            assert Decimal(shift["salary_earned"]) == Decimal(base)
            shifts[day] = shift["id"]
        august_shift = result(await submit_shift(client, "2026-08-01", home))
        result(await submit_shift(client, "2026-07-15", home), 409)
        result(await client.post("/api/expenses", json={"date": "2026-07-15", "amount": "9999.00", "category": "Supplies"}))

    async with api_client_factory(baseline.users["owner"]) as client:
        result(await client.patch(f"/api/shifts/{august_shift['id']}", json={"status": "approved"}))
        for day in (15, 16, 31, 12):
            result(await client.patch(f"/api/shifts/{shifts[day]}", json={"status": "approved"}))
        result(await client.patch(f"/api/shifts/{shifts[13]}", json={"status": "rejected"}))
        adjustments = []
        for kind, amount, work_date, venue in (
            ("bonus", "300.00", "2026-07-15", home), ("penalty", "100.00", "2026-07-15", home),
            ("penalty", "50.00", "2026-07-16", home), ("bonus", "900.00", "2026-07-15", cross),
            ("bonus", "3000.00", "2026-08-01", home),
        ):
            adjustment = result(await client.post("/api/adjustments", json={
                "user_id": employee_id, "venue_id": venue, "type": kind, "amount": amount,
                "reason": "Workflow adjustment", "accrual_date": work_date,
            }))
            assert adjustment["accrual_date"] == work_date
            adjustments.append(adjustment["id"])
        settings = {"schedule_type": "twice_monthly", "first_payment_day": first_day, "second_payment_day": second_day}
        result(await client.put("/api/payroll-schedule", params={"venue_id": home}, json=settings))
        periods = result(await client.get("/api/payroll-schedule", params={"venue_id": home, "year": 2026, "month": 7}))["periods"]
        assert [period["planned_payment_date"] for period in periods] == [f"2026-07-{first_day:02d}", f"2026-08-{second_day:02d}"]
        expected = [Decimal(base) + 200, Decimal(base) * 2 - 50]
        runs = []
        for index, period in enumerate(periods):
            params = {"period_start": period["period_start"], "period_end": period["period_end"], "venue_id": home}
            preview = result(await client.get("/api/payroll-runs/preview", params=params))
            assert preview["employees_count"] == 1
            assert preview["shifts_count"] == (1 if index == 0 else 2)
            assert Decimal(preview["total_hours"]) == (8 if index == 0 else 16)
            assert Decimal(preview["total_amount"]) == expected[index]
            assert Decimal(preview["total_bonuses"]) == (300 if index == 0 else 0)
            assert Decimal(preview["total_deductions"]) == (100 if index == 0 else 50)
            run = result(await client.post("/api/payroll-runs", json={**period, "venue_id": home, "revenue_total": "50000.00"}), 201)
            assert run["status"] == "draft"
            assert Decimal(run["total_amount"]) == expected[index]
            assert Decimal(run["total_paid"]) == 0
            assert run["items"][0]["user_id"] == employee_id
            assert run["items"][0]["final_amount"] == preview["rows"][0]["total_amount"]
            runs.append(run)

        summary = result(await client.get("/api/payroll/summary", params={"month": 7, "year": 2026, "venue_id": home}))
        assert Decimal(summary["total_payout"]) == sum(expected)
        before = await counts(db_session)
        result(await client.post("/api/payroll-runs", json={"period_start": "2026-07-01", "period_end": "2026-07-31", "venue_id": home}), 409)
        assert await counts(db_session) == before
        cross_run = result(await client.post("/api/payroll-runs", json={**periods[0], "venue_id": cross}), 201)
        assert Decimal(cross_run["total_amount"]) == Decimal(base) + 900
        result(await client.post(f"/api/payroll-runs/{cross_run['id']}/cancel"))

    async with api_client_factory(employee) as client:
        personal = result(await client.get("/api/me/payroll-runs"))
        assert not {run["id"] for run in runs}.intersection(row["payroll_run_id"] for row in personal)
        result(await client.get("/api/payroll-runs"), 403)
        result(await client.post(f"/api/payroll-runs/{runs[0]['id']}/finalize"), 403)

    async with api_client_factory(baseline.users["owner"]) as client:
        # Later settings and source edits must not alter either saved snapshot.
        result(await client.put("/api/payroll-schedule", params={"venue_id": home}, json={"schedule_type": "manual"}))
        result(await client.patch(f"/api/shifts/{shifts[15]}", json={"end_time": "18:00", "revenue": "24000.00"}))
        result(await client.patch(f"/api/adjustments/{adjustments[0]}/accrual-date", json={"accrual_date": "2026-07-14"}), 409)
        for index, run in enumerate(runs):
            finalized = result(await client.post(f"/api/payroll-runs/{run['id']}/finalize"))
            assert finalized["items"] == run["items"]
            assert finalized["total_amount"] == run["total_amount"]
            assert finalized["planned_payment_date"] == periods[index]["planned_payment_date"]
            assert finalized["finalized_at"] is not None
        first = runs[0]
        path = f"/api/payroll-runs/{first['id']}/payments"
        actual_date = (date.fromisoformat(periods[0]["planned_payment_date"]) - timedelta(days=1)).isoformat()
        partial = {"user_id": employee_id, "amount": "100.00", "payment_date": actual_date, "method": "cash", "idempotency_key": str(uuid4())}
        paid = result(await client.post(path, json=partial), 201)
        assert paid["status"] == "finalized"
        assert Decimal(paid["remaining_amount"]) == expected[0] - 100
        retry = result(await client.post(path, json=partial), 201)
        assert retry == paid
        result(await client.post(path, json={**partial, "amount": str(expected[0]), "idempotency_key": str(uuid4())}), 409)
        result(await client.post(f"/api/payroll-runs/{first['id']}/cancel"), 409)

    async with api_client_factory(employee) as client:
        personal = {row["payroll_run_id"]: row for row in result(await client.get("/api/me/payroll-runs"))}
        assert Decimal(personal[first["id"]]["paid_amount"]) == 100
        assert personal[first["id"]]["payments"][0]["payment_date"] == actual_date
        assert personal[first["id"]]["planned_payment_date"] != actual_date
        assert personal[runs[1]["id"]]["payments"] == []
        for run in runs:
            assert "revenue_total" not in personal[run["id"]]
            assert "payroll_share_percent" not in personal[run["id"]]

    async with api_client_factory(baseline.users["admin"]) as client:
        balance = {**partial, "amount": str(expected[0] - 100), "payment_date": periods[0]["planned_payment_date"], "method": "bank", "idempotency_key": str(uuid4())}
        complete = result(await client.post(path, json=balance), 201)
        assert complete["status"] == "paid"
        assert Decimal(complete["remaining_amount"]) == 0
        assert Decimal(complete["total_paid"]) == expected[0]
        assert result(await client.post(path, json=balance), 201) == complete
        result(await client.post(path, json={**partial, "idempotency_key": str(uuid4())}), 409)
        saved = result(await client.get(f"/api/payroll-runs/{first['id']}"))
        assert saved["paid_at"] is not None
        assert saved["items"][0]["final_amount"] == first["items"][0]["final_amount"]
        assert len(saved["payments"]) == 2
        before = await counts(db_session)
        result(await client.post("/api/payroll-runs", json={**periods[0], "venue_id": home}), 409)
        assert await counts(db_session) == before

    async with api_client_factory(employee) as client:
        personal = result(await client.get("/api/me/payroll-runs"))
        current = {row["payroll_run_id"]: row for row in personal}
        assert current[first["id"]]["status"] == "paid"
        assert Decimal(current[first["id"]]["remaining_amount"]) == 0
        assert len(current[first["id"]]["payments"]) == 2
        assert [row["payment_date"] for row in current[first["id"]]["payments"]] == [periods[0]["planned_payment_date"], actual_date]
        assert cross_run["id"] not in current
        assert current[runs[1]["id"]]["status"] == "finalized"
    async with api_client_factory(baseline.users["senior"]) as client:
        personal = result(await client.get("/api/me/payroll-runs", params={"user_id": employee_id}))
        assert personal == []
    async with api_client_factory(baseline.users["payroll_viewer"]) as client:
        result(await client.get(f"/api/payroll-runs/{first['id']}"))
        result(await client.get(f"/api/payroll-runs/{cross_run['id']}"), 404)
        result(await client.post(path, json=partial), 403)

    run_ids = [UUID(run["id"]) for run in runs]
    shift_ids = (await db_session.scalars(select(PayrollRunShiftSource.shift_id).where(PayrollRunShiftSource.payroll_run_id.in_(run_ids)))).all()
    adjustment_ids = (await db_session.scalars(select(PayrollRunAdjustmentSource.adjustment_id).where(PayrollRunAdjustmentSource.payroll_run_id.in_(run_ids)))).all()
    assert set(shift_ids) == {UUID(shifts[day]) for day in (15, 16, 31)}
    assert set(adjustment_ids) == {UUID(value) for value in adjustments[:3]}
    assert len(shift_ids) == len(set(shift_ids)) == 3
    assert len(adjustment_ids) == len(set(adjustment_ids)) == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("finalize", [False, True])
async def test_cancelled_snapshot_releases_sources_but_keeps_history(api_client_factory, baseline, finalize):
    async with api_client_factory(baseline.users["hourly"]) as client:
        shift = result(await submit_shift(client, "2026-07-15", str(baseline.venues["home"].id)))
    async with api_client_factory(baseline.users["owner"]) as client:
        result(await client.patch(f"/api/shifts/{shift['id']}", json={"status": "approved"}))
        data = {"period_start": "2026-07-01", "period_end": "2026-07-15", "venue_id": shift["venue_id"], "planned_payment_date": "2026-07-20"}
        original = result(await client.post("/api/payroll-runs", json=data), 201)
        if finalize:
            result(await client.post(f"/api/payroll-runs/{original['id']}/finalize"))
        result(await client.post(f"/api/payroll-runs/{original['id']}/cancel"))
        replacement = result(await client.post("/api/payroll-runs", json=data), 201)
        assert replacement["id"] != original["id"]
        assert replacement["total_amount"] == original["total_amount"]
        historical = result(await client.get(f"/api/payroll-runs/{original['id']}"))
        assert historical["status"] == "cancelled"
        assert historical["items"] == original["items"]
        result(await client.post(f"/api/payroll-runs/{original['id']}/finalize"), 409)
        result(await client.post(f"/api/payroll-runs/{replacement['id']}/finalize"))
    async with api_client_factory(baseline.users["hourly"]) as client:
        personal = {row["payroll_run_id"]: row for row in result(await client.get("/api/me/payroll-runs"))}
        assert original["id"] not in personal
        assert personal[replacement["id"]]["planned_payment_date"] == "2026-07-20"
