from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import text


BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def _required_test_database_url() -> str:
    value = os.getenv("TEST_DATABASE_URL", "").strip()
    if not value:
        raise pytest.UsageError(
            "PostgreSQL integration tests require TEST_DATABASE_URL. "
            "Start docker-compose.test.yml or provide an isolated external PostgreSQL URL."
        )
    normalized = value.replace("postgresql+asyncpg://", "postgresql://", 1)
    parsed = urlparse(normalized)
    database_name = parsed.path.lstrip("/").lower()
    if parsed.scheme not in {"postgresql", "postgres"}:
        raise pytest.UsageError("TEST_DATABASE_URL must use PostgreSQL; SQLite is not supported.")
    if "test" not in database_name:
        raise pytest.UsageError(
            "Refusing to run destructive integration fixtures: test database name must contain 'test'."
        )
    configured_database = os.getenv("DATABASE_URL", "").strip()
    if configured_database and configured_database == value:
        raise pytest.UsageError("TEST_DATABASE_URL must not equal the configured DATABASE_URL.")
    return value


TEST_DATABASE_URL = _required_test_database_url()
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["BOT_TOKEN"] = ""
os.environ["SECRET_KEY"] = "phase-0-test-secret"
os.environ["WEB_SESSION_SECRET"] = "phase-0-web-session-secret"
os.environ["AI_FEATURE_ENABLED"] = "false"

from app import database  # noqa: E402
from app.database import get_session, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.routers.api import get_current_user  # noqa: E402
from tests.fixtures.baseline import BaselineData, seed_financial_baseline  # noqa: E402


pytestmark = pytest.mark.integration


async def _reset_public_schema() -> None:
    async with database.engine.begin() as connection:
        await connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await connection.execute(text("CREATE SCHEMA public"))
    await init_db()


@pytest_asyncio.fixture(autouse=True)
async def clean_postgresql_schema():
    await _reset_public_schema()
    yield
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
