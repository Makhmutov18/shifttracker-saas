from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import event, text


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.integration_database import database_identity, validate_test_database_url


def _required_test_database_url() -> str:
    try:
        return validate_test_database_url(
            os.getenv("TEST_DATABASE_URL", "").strip(),
            configured_url=os.getenv("DATABASE_URL", "").strip(),
            allow_reset=os.getenv("TEST_DATABASE_ALLOW_RESET") == "1",
        )
    except ValueError as error:
        raise pytest.UsageError(str(error)) from None


TEST_DATABASE_URL = _required_test_database_url()
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["BOT_TOKEN"] = ""
os.environ["SECRET_KEY"] = "phase-0-test-secret"
os.environ["WEB_SESSION_SECRET"] = "phase-0-web-session-secret"
os.environ["AI_FEATURE_ENABLED"] = "false"
os.environ["DEBUG"] = "false"

from app import database  # noqa: E402
from app.database import get_session, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.routers.api import get_current_user  # noqa: E402
from tests.fixtures.baseline import BaselineData, seed_financial_baseline  # noqa: E402


pytestmark = pytest.mark.integration


@event.listens_for(database.engine.sync_engine, "connect")
def set_test_timeouts(connection, _record):
    cursor = connection.cursor()
    try:
        cursor.execute("SET statement_timeout = '30s'")
        cursor.execute("SET lock_timeout = '5s'")
    finally:
        cursor.close()


async def _reset_public_schema() -> None:
    if database_identity(database.engine.url) != database_identity(TEST_DATABASE_URL):
        raise pytest.UsageError("Application engine does not target the disposable test database.")
    async with database.engine.begin() as connection:
        actual = await connection.scalar(text("SELECT current_database()"))
        if actual != database.engine.url.database:
            raise pytest.UsageError("Connected database does not match the disposable test database.")
        await connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await connection.execute(text("CREATE SCHEMA public"))
    await init_db()


@pytest_asyncio.fixture(autouse=True)
async def clean_postgresql_schema():
    try:
        await _reset_public_schema()
        yield
    finally:
        await database.engine.dispose()


@pytest_asyncio.fixture
async def db_session():
    async with database.async_session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def baseline(db_session) -> BaselineData:
    return await seed_financial_baseline(db_session)


@pytest.fixture
def api_client_factory():
    @asynccontextmanager
    async def create(user: User):
        async def override_current_user() -> User:
            return user

        async def override_session():
            async with database.async_session_factory() as session:
                yield session

        app.dependency_overrides[get_current_user] = override_current_user
        app.dependency_overrides[get_session] = override_session
        try:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                yield client
        finally:
            app.dependency_overrides.clear()

    return create
