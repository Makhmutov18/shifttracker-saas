from __future__ import annotations

import asyncio
import os
import sys
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import Base, PayModel, User, UserRole, Venue  # noqa: E402


def _env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip()


def _env_present(name: str) -> bool:
    value = os.getenv(name)
    return value is not None and bool(value.strip())


def _require_env(name: str) -> str:
    value = _env(name)
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def _parse_decimal(name: str, default: str = "0") -> Decimal:
    raw = _env(name, default)
    try:
        return Decimal(raw or default)
    except Exception as exc:  # pragma: no cover - defensive input validation
        raise SystemExit(f"{name} must be a valid number") from exc


def _parse_telegram_id(raw: str) -> int:
    try:
        telegram_id = int(raw)
    except ValueError as exc:  # pragma: no cover - defensive input validation
        raise SystemExit("BOOTSTRAP_TELEGRAM_ID must be an integer") from exc
    if telegram_id <= 0:
        raise SystemExit("BOOTSTRAP_TELEGRAM_ID must be a positive integer")
    return telegram_id


def _parse_payment_model(raw: str) -> PayModel:
    normalized = raw.strip().lower()
    try:
        return PayModel(normalized)
    except ValueError as exc:  # pragma: no cover - defensive input validation
        allowed = ", ".join(model.value for model in PayModel)
        raise SystemExit(f"BOOTSTRAP_PAYMENT_MODEL must be one of: {allowed}") from exc


async def bootstrap() -> None:
    database_url = _require_env("DATABASE_URL")
    telegram_id = _parse_telegram_id(_require_env("BOOTSTRAP_TELEGRAM_ID"))
    bootstrap_name_env = _env_present("BOOTSTRAP_NAME")
    bootstrap_name = _env("BOOTSTRAP_NAME", "Owner")
    bootstrap_username = _env("BOOTSTRAP_USERNAME", "")
    bootstrap_venue_name_env = _env_present("BOOTSTRAP_VENUE_NAME")
    venue_name = _env("BOOTSTRAP_VENUE_NAME", "Main venue")
    bootstrap_rate_env = _env_present("BOOTSTRAP_RATE")
    rate = _parse_decimal("BOOTSTRAP_RATE", "0")
    bootstrap_payment_model_env = _env_present("BOOTSTRAP_PAYMENT_MODEL")
    payment_model = _parse_payment_model(_env("BOOTSTRAP_PAYMENT_MODEL", "hourly") or "hourly")

    engine = create_async_engine(database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    print("Ensuring tables exist...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        venue_result = await session.execute(
            select(Venue).where(Venue.name == venue_name).limit(1)
        )
        venue = venue_result.scalar_one_or_none()
        venue_created = False
        if venue is None:
            venue = Venue(name=venue_name)
            session.add(venue)
            await session.flush()
            venue_created = True
        elif bootstrap_venue_name_env:
            venue.name = venue_name

        user_result = await session.execute(
            select(User).where(User.telegram_id == telegram_id).limit(1)
        )
        user = user_result.scalar_one_or_none()
        user_created = False

        if user is None:
            user = User(
                telegram_id=telegram_id,
                name=bootstrap_name,
                role=UserRole.owner,
                venue_id=venue.id,
                hourly_rate=rate,
                revenue_percentage=Decimal("0.00"),
                pay_model=payment_model,
                is_active=True,
                invite_token=None,
            )
            session.add(user)
            user_created = True
        else:
            if bootstrap_name_env:
                user.name = bootstrap_name
            user.role = UserRole.owner
            user.venue_id = venue.id
            if bootstrap_rate_env:
                user.hourly_rate = rate
                user.revenue_percentage = Decimal("0.00")
            if bootstrap_payment_model_env:
                user.pay_model = payment_model
            user.is_active = True
            user.invite_token = None

        await session.commit()

    print(f"Venue ready: {venue.name} ({'created' if venue_created else 'reused'})")
    print(f"Bootstrap user ready: {user.name} ({'created' if user_created else 'updated'})")
    print(f"Role set to: {user.role.value}")
    print(f"Payment model set to: {user.pay_model.value}")
    print(f"Hourly rate set to: {user.hourly_rate}")
    if bootstrap_username:
        print("BOOTSTRAP_USERNAME was provided and accepted as metadata hint.")
    print("Bootstrap completed successfully.")


if __name__ == "__main__":
    asyncio.run(bootstrap())
