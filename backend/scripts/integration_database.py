"""Safety checks for fixtures that intentionally destroy a disposable schema."""

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


def database_identity(value):
    try:
        url = make_url(value)
    except (ArgumentError, ValueError):
        raise ValueError("Invalid database URL.") from None
    host = (url.host or "").lower()
    if host in {"localhost", "127.0.0.1", "::1"}:
        host = "loopback"
    return host, url.port or 5432, url.database


def validate_test_database_url(value, *, configured_url="", allow_reset=False):
    if not allow_reset:
        raise ValueError("Schema reset requires TEST_DATABASE_ALLOW_RESET=1 for a disposable database.")
    if not value:
        raise ValueError("PostgreSQL integration tests require TEST_DATABASE_URL.")
    try:
        url = make_url(value)
    except (ArgumentError, ValueError):
        raise ValueError("Invalid TEST_DATABASE_URL.") from None
    if url.drivername not in {"postgres", "postgresql", "postgresql+asyncpg"}:
        raise ValueError("TEST_DATABASE_URL must use PostgreSQL.")
    if not url.host or url.query:
        raise ValueError("TEST_DATABASE_URL requires a hostname and must not contain query overrides.")
    if "test" not in (url.database or "").lower().split("_"):
        raise ValueError("Disposable database name must include a separate 'test' segment.")
    if configured_url and database_identity(configured_url) == database_identity(value):
        raise ValueError("TEST_DATABASE_URL must not target the configured DATABASE_URL.")
    return value
