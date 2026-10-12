from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import database
from app.database import init_db
from app.models import PayrollPayment, PayrollRun
from app.routers.api import create_payroll_payment
from app.schemas import PayrollPaymentCreate
from tests.fixtures.baseline import PAYMENT_DATE, PERIOD_END, PERIOD_START
from tests.integration.test_payroll_concurrency import competing_operations


pytestmark = pytest.mark.integration


def payment_body(baseline, **changes):
    return {
        "user_id": str(baseline.users["hourly"].id), "amount": "100.00",
        "payment_date": PAYMENT_DATE.isoformat(), "method": "cash", "comment": "Test payment",
        "idempotency_key": str(uuid.uuid4()), **changes,
    }


@pytest.mark.asyncio
async def test_http_retry_returns_same_payment_and_current_balances(api_client_factory, db_session, baseline):
    body = payment_body(baseline)
    path = f"/api/payroll-runs/{baseline.payroll_run.id}/payments"
    async with api_client_factory(baseline.users["owner"]) as client:
        first = await client.post(path, json=body)
        retry = await client.post(path, json=body)
    assert first.status_code == retry.status_code == 201
    assert first.json() == retry.json()
    assert retry.json()["paid_amount"] == "1100.00"
    assert retry.json()["remaining_amount"] == "1200.00"
    assert await db_session.scalar(select(func.count(PayrollPayment.id))) == 2
    await db_session.refresh(baseline.payroll_run)
    assert baseline.payroll_run.total_paid == Decimal("1100.00")


@pytest.mark.asyncio
async def test_old_key_returns_original_payment_with_latest_balances(api_client_factory, baseline):
    body = payment_body(baseline)
    path = f"/api/payroll-runs/{baseline.payroll_run.id}/payments"
    async with api_client_factory(baseline.users["owner"]) as client:
        first = await client.post(path, json=body)
        later = await client.post(path, json={**body, "idempotency_key": str(uuid.uuid4())})
        retry = await client.post(path, json=body)
    assert first.status_code == later.status_code == retry.status_code == 201
    assert retry.json()["payment"] == first.json()["payment"]
    assert retry.json()["paid_amount"] == "1200.00"
    assert retry.json()["remaining_amount"] == "1100.00"
    assert retry.json()["total_paid"] == "1200.00"


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [
    ("amount", "101.00"), ("method", "transfer"), ("comment", "Changed"),
    ("payment_date", (PAYMENT_DATE + timedelta(days=1)).isoformat()), ("user_id", None),
])
async def test_same_key_with_changed_payload_is_conflict(api_client_factory, db_session, baseline, field, value):
    body = payment_body(baseline)
    changed = {**body, field: value if field != "user_id" else str(baseline.users["fixed"].id)}
    path = f"/api/payroll-runs/{baseline.payroll_run.id}/payments"
    async with api_client_factory(baseline.users["owner"]) as client:
        assert (await client.post(path, json=body)).status_code == 201
        assert (await client.post(path, json=changed)).status_code == 409
    assert await db_session.scalar(select(func.count(PayrollPayment.id))) == 2
    await db_session.refresh(baseline.payroll_run)
    assert baseline.payroll_run.total_paid == Decimal("1100.00")


@pytest.mark.asyncio
async def test_retry_of_final_payment_is_allowed_after_run_is_paid(api_client_factory, db_session, baseline):
    for item in baseline.payroll_run.items[1:]:
        item.paid_amount = item.final_amount
        item.remaining_amount = Decimal("0.00")
        db_session.add(PayrollPayment(
            payroll_run_id=baseline.payroll_run.id, user_id=item.user_id, amount=item.final_amount,
            payment_date=PAYMENT_DATE, created_by_id=baseline.users["owner"].id,
        ))
    baseline.payroll_run.total_paid = Decimal("7500.00")
    await db_session.commit()
    body = payment_body(baseline, amount="1300.00")
    path = f"/api/payroll-runs/{baseline.payroll_run.id}/payments"
    async with api_client_factory(baseline.users["owner"]) as client:
        first = await client.post(path, json=body)
        retry = await client.post(path, json=body)
        new_payment = await client.post(path, json={**body, "idempotency_key": str(uuid.uuid4())})
    assert first.status_code == retry.status_code == 201
    assert first.json() == retry.json()
    assert retry.json()["status"] == "paid"
    assert retry.json()["remaining_amount"] == "0.00"
    assert retry.json()["total_paid"] == "8800.00"
    assert new_payment.status_code == 409
    assert await db_session.scalar(select(func.count(PayrollPayment.id))) == 5


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy", [False, True])
async def test_distinct_operations_can_have_same_payment_fields(api_client_factory, db_session, baseline, legacy):
    body = payment_body(baseline)
    if legacy:
        body.pop("idempotency_key")
    path = f"/api/payroll-runs/{baseline.payroll_run.id}/payments"
    async with api_client_factory(baseline.users["owner"]) as client:
        first = await client.post(path, json=body)
        second = await client.post(path, json=body if legacy else {**body, "idempotency_key": str(uuid.uuid4())})
    assert first.status_code == second.status_code == 201
    assert first.json()["payment"]["id"] != second.json()["payment"]["id"]
    assert second.json()["total_paid"] == "1200.00"
    assert await db_session.scalar(select(func.count(PayrollPayment.id))) == 3


@pytest.mark.asyncio
async def test_concurrent_same_key_creates_one_partial_payment(db_session, baseline):
    data = PayrollPaymentCreate(**payment_body(baseline))

    async def pay(session):
        return await create_payroll_payment(baseline.payroll_run.id, data, user=baseline.users["owner"], session=session)

    first, second = await competing_operations(pay, pay)
    assert first.payment.id == second.payment.id
    assert first.total_paid == second.total_paid == Decimal("1100.00")
    assert await db_session.scalar(select(func.count(PayrollPayment.id))) == 2


@pytest.mark.asyncio
async def test_rollback_does_not_consume_idempotency_key(db_session, baseline):
    data = PayrollPaymentCreate(**payment_body(baseline))

    class FailingSession(AsyncSession):
        async def commit(self):
            raise RuntimeError("Injected commit failure")

    async with FailingSession(database.engine, expire_on_commit=False) as session:
        with pytest.raises(RuntimeError, match="Injected commit failure"):
            await create_payroll_payment(baseline.payroll_run.id, data, user=baseline.users["owner"], session=session)
    async with database.async_session_factory() as session:
        result = await create_payroll_payment(baseline.payroll_run.id, data, user=baseline.users["owner"], session=session)
    assert result.total_paid == Decimal("1100.00")
    assert await db_session.scalar(select(func.count(PayrollPayment.id))) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("actor,expected", [("hourly", 403), ("payroll_viewer", 403), ("admin", 409)])
async def test_retry_does_not_bypass_permissions_or_creator(api_client_factory, baseline, actor, expected):
    body = payment_body(baseline)
    path = f"/api/payroll-runs/{baseline.payroll_run.id}/payments"
    async with api_client_factory(baseline.users["owner"]) as client:
        assert (await client.post(path, json=body)).status_code == 201
    async with api_client_factory(baseline.users[actor]) as client:
        response = await client.post(path, json=body)
    assert response.status_code == expected
    assert "payment" not in response.json()


@pytest.mark.asyncio
async def test_key_is_scoped_to_run_and_uuid_is_validated(api_client_factory, baseline):
    body = payment_body(baseline)
    async with api_client_factory(baseline.users["owner"]) as client:
        path = f"/api/payroll-runs/{baseline.payroll_run.id}/payments"
        assert (await client.post(path, json={**body, "idempotency_key": "invalid"})).status_code == 422
        assert (await client.post(path, json=body)).status_code == 201
        created = await client.post("/api/payroll-runs", json={
            "period_start": PERIOD_START.isoformat(), "period_end": PERIOD_END.isoformat(),
            "venue_id": str(baseline.venues["cross"].id),
        })
        assert created.status_code == 201
        run_id = created.json()["id"]
        assert (await client.post(f"/api/payroll-runs/{run_id}/finalize")).status_code == 200
        other = await client.post(f"/api/payroll-runs/{run_id}/payments", json=body)
        assert other.status_code == 201
        assert other.json()["total_paid"] == "100.00"


@pytest.mark.asyncio
async def test_unique_index_rejects_duplicate_key_directly(db_session, baseline):
    key = uuid.uuid4()
    for _ in range(2):
        db_session.add(PayrollPayment(
            payroll_run_id=baseline.payroll_run.id, user_id=baseline.users["hourly"].id,
            amount=Decimal("100.00"), payment_date=PAYMENT_DATE,
            created_by_id=baseline.users["owner"].id, idempotency_key=key,
        ))
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_bootstrap_adds_nullable_column_and_index_to_existing_table(db_session, baseline):
    run_id = baseline.payroll_run.id
    async with database.engine.begin() as connection:
        await connection.execute(text("ALTER TABLE payroll_payments DROP COLUMN idempotency_key"))
    await init_db()
    await init_db()
    assert await db_session.scalar(select(func.count(PayrollPayment.id))) == 1
    payment = await db_session.scalar(select(PayrollPayment).execution_options(populate_existing=True))
    assert payment.idempotency_key is None
    assert payment.amount == Decimal("1000.00")
    run = await db_session.get(PayrollRun, run_id, populate_existing=True)
    assert run.total_paid == Decimal("1000.00")
    definition = await db_session.scalar(text(
        "SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_payroll_payments_run_idempotency'"
    ))
    assert "UNIQUE" in definition
    assert "payroll_run_id, idempotency_key" in definition
