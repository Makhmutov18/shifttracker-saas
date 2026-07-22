from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import func, select, text

from app import database
from app.database import Base, init_db
from app.models import PayrollRun, User, Venue


pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_empty_database_initialization_creates_all_mapped_tables(db_session):
    rows = await db_session.execute(
        text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    )
    actual = set(rows.scalars())
    expected = set(Base.metadata.tables)

    assert expected <= actual
    assert {"users", "venues", "shifts", "payroll_runs", "payroll_payments"} <= actual


@pytest.mark.asyncio
async def test_repeated_initialization_preserves_existing_data_and_payroll_values(db_session, baseline):
    before = (
        await db_session.scalar(select(func.count(User.id))),
        await db_session.scalar(select(func.count(Venue.id))),
        await db_session.scalar(select(func.count(PayrollRun.id))),
        await db_session.scalar(select(PayrollRun.total_amount).where(PayrollRun.id == baseline.payroll_run.id)),
        await db_session.scalar(select(PayrollRun.total_paid).where(PayrollRun.id == baseline.payroll_run.id)),
    )

    await init_db()
    await init_db()

    after = (
        await db_session.scalar(select(func.count(User.id))),
        await db_session.scalar(select(func.count(Venue.id))),
        await db_session.scalar(select(func.count(PayrollRun.id))),
        await db_session.scalar(select(PayrollRun.total_amount).where(PayrollRun.id == baseline.payroll_run.id)),
        await db_session.scalar(select(PayrollRun.total_paid).where(PayrollRun.id == baseline.payroll_run.id)),
    )
    assert after == before
    assert after[-2:] == (Decimal("8800.00"), Decimal("1000.00"))


@pytest.mark.asyncio
async def test_current_unique_constraints_and_indexes_exist(db_session):
    constraints = await db_session.execute(text("""
        SELECT c.conrelid::regclass::text AS table_name, pg_get_constraintdef(c.oid)
        FROM pg_constraint c
        WHERE c.contype = 'u'
    """))
    definitions = {(table_name, definition) for table_name, definition in constraints.all()}
    indexes = set((await db_session.execute(text("""
        SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    """))).scalars())

    assert any(table == "users" and "telegram_id" in definition for table, definition in definitions)
    assert any(table == "users" and "invite_token" in definition for table, definition in definitions)
    assert any(table == "payroll_run_shift_sources" and "shift_id" in definition for table, definition in definitions)
    assert any(table == "payroll_run_adjustment_sources" and "adjustment_id" in definition for table, definition in definitions)
    assert "ix_users_invite_token" in indexes


@pytest.mark.asyncio
async def test_database_engine_is_the_explicit_test_database():
    assert database.engine.url.drivername == "postgresql+asyncpg"
    assert "test" in database.engine.url.database.lower()
