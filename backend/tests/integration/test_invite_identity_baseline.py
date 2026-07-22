from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import bot, database
from app.models import PayModel, User, UserRole
from tests.fixtures.baseline import uid


pytestmark = pytest.mark.integration


class FakeMessage:
    def __init__(self, telegram_id: int, full_name: str = "Invited Telegram User"):
        self.from_user = SimpleNamespace(id=telegram_id, full_name=full_name)
        self.answers: list[tuple[str, object | None]] = []

    async def answer(self, text: str, reply_markup=None):
        self.answers.append((text, reply_markup))


def _sync_test_engine():
    url = str(database.engine.url).replace("postgresql+asyncpg://", "postgresql://", 1)
    return create_engine(url, pool_pre_ping=True)


@pytest.mark.asyncio
async def test_valid_invite_activates_expected_user_and_reuse_is_rejected(db_session, baseline, monkeypatch):
    sync_engine = _sync_test_engine()
    monkeypatch.setattr(bot, "_get_sync_session", lambda: Session(bind=sync_engine))
    monkeypatch.setattr(bot, "notify_user_activated", AsyncMock())
    invited = baseline.users["invited"]
    original_profile = (invited.venue_id, invited.pay_model, invited.hourly_rate)

    first_message = FakeMessage(920000001)
    await bot.cmd_start(first_message, SimpleNamespace(args="baseline-invite"))
    await db_session.refresh(invited)

    assert invited.telegram_id == 920000001
    assert invited.is_active is True
    assert invited.invite_token is None
    assert (invited.venue_id, invited.pay_model, invited.hourly_rate) == original_profile
    assert first_message.answers

    reused_message = FakeMessage(920000002)
    await bot.cmd_start(reused_message, SimpleNamespace(args="baseline-invite"))
    assert reused_message.answers
    assert "920000002" not in " ".join(text for text, _ in reused_message.answers)
    sync_engine.dispose()


@pytest.mark.asyncio
async def test_invalid_invite_does_not_modify_users(db_session, baseline, monkeypatch):
    sync_engine = _sync_test_engine()
    monkeypatch.setattr(bot, "_get_sync_session", lambda: Session(bind=sync_engine))
    monkeypatch.setattr(bot, "notify_user_activated", AsyncMock())

    message = FakeMessage(920000003)
    await bot.cmd_start(message, SimpleNamespace(args="invalid-token"))
    await db_session.refresh(baseline.users["invited"])

    assert baseline.users["invited"].telegram_id is None
    assert baseline.users["invited"].invite_token == "baseline-invite"
    assert message.answers
    sync_engine.dispose()


@pytest.mark.asyncio
async def test_existing_telegram_identity_remains_unique(db_session, baseline):
    duplicate = User(
        id=uid(999),
        telegram_id=baseline.users["owner"].telegram_id,
        name="Duplicate identity",
        role=UserRole.barista,
        venue_id=baseline.venues["home"].id,
        hourly_rate=0,
        revenue_percentage=0,
        permissions={},
        pay_model=PayModel.hourly,
        is_active=True,
    )
    db_session.add(duplicate)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()
