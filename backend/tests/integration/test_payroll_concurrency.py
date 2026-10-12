from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app import database
from app.models import (
    PayrollPayment, PayrollRun, PayrollRunItem, PayrollRunStatus,
    PayrollRunShiftSource, PayrollRunAdjustmentSource, Shift,
)
from app.routers import api
from app.routers.api import (
    cancel_payroll_run, create_payroll_payment, create_payroll_run,
    finalize_payroll_run, update_payroll_run_revenue,
)
from app.schemas import PayrollPaymentCreate, PayrollRunCreate, PayrollRunRevenueUpdate
from tests.fixtures.baseline import PAYMENT_DATE, PERIOD_END, PERIOD_START


pytestmark = pytest.mark.integration


async def competing_operations(first_operation, second_operation):
    """Hold the first transaction open and observe the second waiting in PostgreSQL."""
    held = asyncio.Event()
    release = asyncio.Event()
    second_ready = asyncio.Event()
    second_pid = None

    class HoldingSession(AsyncSession):
        async def commit(self):
            held.set()
            await release.wait()
            await super().commit()

    async def invoke(operation, *, hold=False):
        nonlocal second_pid
        session_type = HoldingSession if hold else AsyncSession
        async with session_type(database.engine, expire_on_commit=False) as session:
            if not hold:
                second_pid = await session.scalar(text("SELECT pg_backend_pid()"))
                second_ready.set()
            try:
                return await operation(session)
            except HTTPException as error:
                await session.rollback()
                return error.status_code

    first = asyncio.create_task(invoke(first_operation, hold=True))
    second = None
    try:
        await asyncio.wait_for(held.wait(), timeout=5)
        second = asyncio.create_task(invoke(second_operation))
        await asyncio.wait_for(second_ready.wait(), timeout=5)
        blocked = False
        async with database.async_session_factory() as observer:
            for _ in range(100):
                blocked = await observer.scalar(
                    text("SELECT cardinality(pg_blocking_pids(:pid)) > 0"), {"pid": second_pid},
                )
                if blocked or second.done():
                    break
                await asyncio.sleep(0.01)
        assert blocked, "Competing payroll mutation did not wait for the first transaction"
    finally:
        release.set()
        tasks = [task for task in (first, second) if task is not None]
        results = await asyncio.wait_for(asyncio.gather(*tasks), timeout=5)
    return results


@pytest.mark.asyncio
@pytest.mark.parametrize("adjustments_only", [False, True])
async def test_concurrent_creation_cannot_reserve_sources_twice(db_session, baseline, adjustments_only):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    if adjustments_only:
        for adjustment in baseline.adjustments.values():
            adjustment.accrual_date = date(2026, 6, 20)
    await db_session.commit()
    start = date(2026, 6, 20) if adjustments_only else PERIOD_START
    data = PayrollRunCreate(period_start=start, period_end=PERIOD_END, venue_id=baseline.venues["home"].id)

    async def create(session):
        return await create_payroll_run(data, user=baseline.users["owner"], session=session)

    first, second = await competing_operations(create, create)
    assert first.status == PayrollRunStatus.draft.value
    assert second == 409
    runs = (await db_session.scalars(select(PayrollRun).where(PayrollRun.status == PayrollRunStatus.draft))).all()
    assert len(runs) == 1
    assert await db_session.scalar(select(func.count(PayrollRunItem.id)).where(PayrollRunItem.payroll_run_id == runs[0].id)) == (1 if adjustments_only else 4)
    source_model = PayrollRunAdjustmentSource if adjustments_only else PayrollRunShiftSource
    assert await db_session.scalar(select(func.count(source_model.id)).where(source_model.payroll_run_id == runs[0].id)) == (2 if adjustments_only else 4)


async def prepare_unpaid_run(db_session, baseline, *, draft=False):
    await db_session.execute(PayrollPayment.__table__.delete())
    for item in baseline.payroll_run.items:
        item.paid_amount = Decimal("0.00")
        item.remaining_amount = item.final_amount
    baseline.payroll_run.total_paid = Decimal("0.00")
    baseline.payroll_run.status = PayrollRunStatus.draft if draft else PayrollRunStatus.finalized
    await db_session.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize("payment_first", [False, True])
async def test_cancel_and_payment_are_mutually_exclusive(db_session, baseline, payment_first):
    await prepare_unpaid_run(db_session, baseline)
    run_id = baseline.payroll_run.id

    async def cancel(session):
        return await cancel_payroll_run(run_id, user=baseline.users["owner"], session=session)

    async def pay(session):
        return await create_payroll_payment(run_id, PayrollPaymentCreate(
            user_id=baseline.users["hourly"].id, amount=Decimal("100.00"), payment_date=PAYMENT_DATE,
        ), user=baseline.users["owner"], session=session)

    first, second = await competing_operations(pay if payment_first else cancel, cancel if payment_first else pay)
    assert second == 409
    await db_session.refresh(baseline.payroll_run)
    assert baseline.payroll_run.status == (PayrollRunStatus.finalized if payment_first else PayrollRunStatus.cancelled)
    assert baseline.payroll_run.total_paid == (Decimal("100.00") if payment_first else Decimal("0.00"))
    assert await db_session.scalar(select(func.count(PayrollPayment.id))) == (1 if payment_first else 0)


@pytest.mark.asyncio
async def test_two_full_payments_cannot_overpay_cached_snapshot(db_session, baseline):
    run_id = baseline.payroll_run.id
    item_id = baseline.payroll_run.items[0].id
    data = PayrollPaymentCreate(user_id=baseline.users["hourly"].id, amount=Decimal("1300.00"), payment_date=PAYMENT_DATE)

    async def pay(session):
        # A previously loaded ORM object must not bypass a subsequent row lock refresh.
        cached_run = await session.get(PayrollRun, run_id)
        cached_item = await session.get(PayrollRunItem, item_id)
        result = await create_payroll_payment(run_id, data, user=baseline.users["owner"], session=session)
        assert cached_run.total_paid == cached_item.paid_amount == Decimal("2300.00")
        return result

    first, second = await competing_operations(pay, pay)
    assert second == 409
    await db_session.refresh(baseline.payroll_run)
    item = await db_session.get(PayrollRunItem, item_id, populate_existing=True)
    assert item.paid_amount == Decimal("2300.00")
    assert item.remaining_amount == Decimal("0.00")
    assert baseline.payroll_run.total_paid == Decimal("2300.00")
    assert await db_session.scalar(select(func.sum(PayrollPayment.amount))) == Decimal("2300.00")


@pytest.mark.asyncio
async def test_finalize_blocks_late_revenue_edit(db_session, baseline):
    await prepare_unpaid_run(db_session, baseline, draft=True)
    run_id = baseline.payroll_run.id

    async def finalize(session):
        return await finalize_payroll_run(run_id, user=baseline.users["owner"], session=session)

    async def edit(session):
        return await update_payroll_run_revenue(run_id, PayrollRunRevenueUpdate(revenue_total=Decimal("99999.00")),
            user=baseline.users["owner"], session=session)

    first, second = await competing_operations(finalize, edit)
    assert second == 409
    await db_session.refresh(baseline.payroll_run)
    assert baseline.payroll_run.status == PayrollRunStatus.finalized
    assert baseline.payroll_run.finalized_at is not None
    assert baseline.payroll_run.revenue_total == Decimal("40000.00")


@pytest.mark.asyncio
async def test_last_payment_refreshes_other_cached_employee_balances(db_session, baseline):
    for item in baseline.payroll_run.items[2:]:
        item.paid_amount = item.final_amount
        item.remaining_amount = Decimal("0.00")
        db_session.add(PayrollPayment(
            payroll_run_id=baseline.payroll_run.id, user_id=item.user_id, amount=item.final_amount,
            payment_date=PAYMENT_DATE, created_by_id=baseline.users["owner"].id,
        ))
    baseline.payroll_run.total_paid = Decimal("5700.00")
    await db_session.commit()
    run_id = baseline.payroll_run.id

    async def first_payment(session):
        return await create_payroll_payment(run_id, PayrollPaymentCreate(
            user_id=baseline.users["hourly"].id, amount=Decimal("1300.00"), payment_date=PAYMENT_DATE,
        ), user=baseline.users["owner"], session=session)

    async def last_payment(session):
        cached_items = list(await session.scalars(select(PayrollRunItem).where(PayrollRunItem.payroll_run_id == run_id)))
        result = await create_payroll_payment(run_id, PayrollPaymentCreate(
            user_id=baseline.users["fixed"].id, amount=Decimal("1800.00"), payment_date=PAYMENT_DATE,
        ), user=baseline.users["owner"], session=session)
        assert all(item.remaining_amount == Decimal("0.00") for item in cached_items)
        return result

    first, last = await competing_operations(first_payment, last_payment)
    assert first.status == PayrollRunStatus.finalized.value
    assert last.status == PayrollRunStatus.paid.value
    assert last.total_paid == Decimal("8800.00")
    await db_session.refresh(baseline.payroll_run)
    assert baseline.payroll_run.paid_at is not None
    assert await db_session.scalar(select(func.sum(PayrollPayment.amount))) == Decimal("8800.00")


@pytest.mark.asyncio
async def test_finalize_and_cancel_do_not_overwrite_each_other(db_session, baseline):
    await prepare_unpaid_run(db_session, baseline, draft=True)
    run_id = baseline.payroll_run.id

    async def cancel(session):
        return await cancel_payroll_run(run_id, user=baseline.users["owner"], session=session)

    async def finalize(session):
        return await finalize_payroll_run(run_id, user=baseline.users["owner"], session=session)

    first, second = await competing_operations(cancel, finalize)
    assert second == 409
    await db_session.refresh(baseline.payroll_run)
    assert baseline.payroll_run.status == PayrollRunStatus.cancelled
    assert baseline.payroll_run.finalized_at is None


@pytest.mark.asyncio
async def test_failed_creation_rolls_back_snapshot_and_releases_source_locks(db_session, baseline):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    await db_session.commit()
    data = PayrollRunCreate(period_start=PERIOD_START, period_end=PERIOD_END, venue_id=baseline.venues["home"].id)

    class FailingSession(AsyncSession):
        async def commit(self):
            raise RuntimeError("Injected failure before commit")

    async with FailingSession(database.engine, expire_on_commit=False) as session:
        with pytest.raises(RuntimeError, match="Injected failure"):
            await create_payroll_run(data, user=baseline.users["owner"], session=session)
        assert not session.in_transaction()

    assert await db_session.scalar(select(func.count(PayrollRun.id))) == 1
    assert await db_session.scalar(select(func.count(PayrollRunItem.id))) == 4
    await db_session.commit()
    async with database.async_session_factory() as session:
        created = await create_payroll_run(data, user=baseline.users["owner"], session=session)
    assert created.total_amount == Decimal("8800.00")
    assert len(created.items) == 4


@pytest.mark.asyncio
async def test_distinct_venues_with_disjoint_sources_can_create_same_period(db_session, baseline):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    await db_session.commit()

    async def create(venue_id):
        async with database.async_session_factory() as session:
            return await create_payroll_run(PayrollRunCreate(
                period_start=PERIOD_START, period_end=PERIOD_END, venue_id=venue_id,
            ), user=baseline.users["owner"], session=session)

    home, cross = await asyncio.wait_for(asyncio.gather(
        create(baseline.venues["home"].id), create(baseline.venues["cross"].id),
    ), timeout=5)
    assert home.total_amount == Decimal("8800.00")
    assert cross.total_amount == Decimal("1000.00")


@pytest.mark.asyncio
async def test_snapshot_and_source_links_use_same_selection(db_session, baseline, monkeypatch):
    baseline.payroll_run.status = PayrollRunStatus.cancelled
    await db_session.commit()
    original_loader = api._load_payroll_sources
    new_shift_id = None

    async def insert_after_selection(*args, **kwargs):
        nonlocal new_shift_id
        sources = await original_loader(*args, **kwargs)
        if kwargs.get("for_update"):
            async with database.async_session_factory() as session:
                shift = Shift(
                    user_id=baseline.users["fixed"].id, venue_id=baseline.venues["home"].id,
                    date=date(2026, 6, 29), start_time=baseline.shifts["fixed_approved"].start_time,
                    end_time=baseline.shifts["fixed_approved"].end_time, total_hours=Decimal("8.00"),
                    salary_earned=Decimal("77.00"), status="approved",
                )
                session.add(shift)
                await session.commit()
                new_shift_id = shift.id
        return sources

    monkeypatch.setattr(api, "_load_payroll_sources", insert_after_selection)
    async with database.async_session_factory() as session:
        created = await create_payroll_run(PayrollRunCreate(
            period_start=PERIOD_START, period_end=PERIOD_END, venue_id=baseline.venues["home"].id,
        ), user=baseline.users["owner"], session=session)

    assert created.total_amount == Decimal("8800.00")
    source_ids = set(await db_session.scalars(select(PayrollRunShiftSource.shift_id).where(
        PayrollRunShiftSource.payroll_run_id == created.id,
    )))
    assert len(source_ids) == 4
    assert new_shift_id not in source_ids
    assert await db_session.get(Shift, new_shift_id) is not None
