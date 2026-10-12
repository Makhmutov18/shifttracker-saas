import hashlib
import hmac
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from starlette.requests import Request


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import auth, main  # noqa: E402
from app.models import User, UserRole  # noqa: E402


TEST_BOT_TOKEN = "123456:local-security-test-token"
NOW = datetime(2026, 10, 12, 12, tzinfo=timezone.utc)


def signed_init_data(auth_date=None, *, bot_token=TEST_BOT_TOKEN, **extra):
    fields = {"user": json.dumps({"id": 123, "first_name": "Test"})}
    if auth_date is not None:
        fields["auth_date"] = str(auth_date)
    fields.update(extra)
    check_string = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def request(method="POST", *, csrf_header=None, csrf_cookie=None):
    headers = []
    if csrf_header is not None:
        headers.append((b"x-csrf-token", csrf_header.encode()))
    if csrf_cookie is not None:
        headers.append((b"cookie", f"{auth.WEB_CSRF_COOKIE}={csrf_cookie}".encode()))
    return Request({"type": "http", "method": method, "path": "/api/test", "headers": headers})


class InitDataSecurityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.token_patch = patch.object(auth.settings, "BOT_TOKEN", TEST_BOT_TOKEN)
        self.age_patch = patch.object(auth.settings, "TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", 86400)
        self.clock_patch = patch.object(auth, "datetime", wraps=datetime)
        self.token_patch.start()
        self.age_patch.start()
        self.clock_patch.start().now.return_value = NOW
        self.addCleanup(self.token_patch.stop)
        self.addCleanup(self.age_patch.stop)
        self.addCleanup(self.clock_patch.stop)

    def test_valid_signature_and_freshness_boundaries(self):
        now = int(NOW.timestamp())
        for offset in (0, -1, -86400, 30):
            with self.subTest(offset=offset):
                self.assertTrue(auth.validate_init_data(signed_init_data(now + offset)))

    def test_expired_future_missing_and_malformed_dates_are_rejected(self):
        now = int(NOW.timestamp())
        for value in (now - 86401, now + 31, None, "", "abc", "1.5", "-1", "0", "１２３"):
            with self.subTest(value=value):
                self.assertFalse(auth.validate_init_data(signed_init_data(value)))

    def test_signature_and_duplicate_fields_are_rejected(self):
        data = signed_init_data(int(NOW.timestamp()))
        self.assertFalse(auth.validate_init_data(data.replace("first_name", "last_name")))
        self.assertFalse(auth.validate_init_data(data + "&auth_date=1"))
        self.assertFalse(auth.validate_init_data(data + "&hash=invalid"))

    def test_empty_bot_token_fails_closed(self):
        with patch.object(auth.settings, "BOT_TOKEN", ""):
            self.assertFalse(auth.validate_init_data(signed_init_data(int(NOW.timestamp()), bot_token="")))

    async def test_expired_auth_is_rejected_before_user_lookup(self):
        session = AsyncMock()
        with self.assertRaises(HTTPException) as error:
            await auth.authenticate_request(
                request(), signed_init_data(int(NOW.timestamp()) - 86401), session
            )
        self.assertEqual(error.exception.status_code, 401)
        session.execute.assert_not_awaited()

    async def test_active_user_authenticates_and_inactive_user_is_denied(self):
        user = User(telegram_id=123, name="Test", role=UserRole.barista, is_active=True)
        result = Mock()
        result.scalar_one_or_none.return_value = user
        session = AsyncMock()
        session.execute.return_value = result
        data = signed_init_data(int(NOW.timestamp()))
        self.assertIs(await auth.authenticate_request(request(), data, session), user)
        session.commit.assert_not_awaited()
        user.is_active = False
        with self.assertRaises(HTTPException) as error:
            await auth.authenticate_request(request(), data, session)
        self.assertEqual(error.exception.status_code, 403)


class CsrfSecurityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.web_session = SimpleNamespace(csrf_token_hash=auth.hash_secret("test-csrf-token"))

    def test_cookie_alone_does_not_authorize_mutations(self):
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            with self.subTest(method=method), self.assertRaises(HTTPException) as error:
                auth.ensure_web_csrf(request(method, csrf_cookie="test-csrf-token"), self.web_session)
            self.assertEqual(error.exception.status_code, 403)

    def test_matching_header_authorizes_mutations(self):
        auth.ensure_web_csrf(request(csrf_header="test-csrf-token"), self.web_session)

    def test_wrong_header_cannot_fall_back_to_valid_cookie(self):
        with self.assertRaises(HTTPException) as error:
            auth.ensure_web_csrf(
                request(csrf_header="wrong", csrf_cookie="test-csrf-token"), self.web_session
            )
        self.assertEqual(error.exception.status_code, 403)

    def test_safe_methods_do_not_require_csrf(self):
        for method in ("GET", "HEAD", "OPTIONS"):
            auth.ensure_web_csrf(request(method), self.web_session)

    async def test_cookie_auth_path_requires_header_for_all_roles(self):
        for role in UserRole:
            user = User(name="Test", role=role, is_active=True)
            with self.subTest(role=role), patch.object(
                auth, "get_web_session_user", AsyncMock(return_value=(self.web_session, user))
            ):
                with self.assertRaises(HTTPException) as error:
                    await auth.authenticate_request(
                        request(csrf_cookie="test-csrf-token"), None, AsyncMock()
                    )
                self.assertEqual(error.exception.status_code, 403)
                self.assertIs(
                    await auth.authenticate_request(
                        request(csrf_header="test-csrf-token"), None, AsyncMock()
                    ), user
                )


class WebhookSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bot = Mock()
        self.dispatcher = Mock(feed_update=AsyncMock())
        for target, name, value in (
            (main.settings, "BOT_TOKEN", TEST_BOT_TOKEN),
            (main, "_bot", self.bot),
            (main, "_dispatcher", self.dispatcher),
        ):
            patcher = patch.object(target, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        # ASGITransport deliberately does not start lifespan or connect to any database.
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=main.app), base_url="http://test"
        )
        self.addAsyncCleanup(self.client.aclose)

    def headers(self):
        return {"X-Telegram-Bot-Api-Secret-Token": main.settings.telegram_webhook_secret}

    async def test_missing_and_wrong_secret_are_denied_before_body_parsing(self):
        for headers in ({}, {"X-Telegram-Bot-Api-Secret-Token": "wrong"}):
            with self.subTest(headers=headers):
                response = await self.client.post("/webhook", headers=headers, content="not JSON")
                self.assertEqual(response.status_code, 403)
        self.dispatcher.feed_update.assert_not_awaited()

    async def test_valid_secret_dispatches_update(self):
        response = await self.client.post("/webhook", headers=self.headers(), json={"update_id": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        self.dispatcher.feed_update.assert_awaited_once()
        bot, update = self.dispatcher.feed_update.call_args.args
        self.assertIs(bot, self.bot)
        self.assertEqual(update.update_id, 1)

    async def test_unconfigured_bot_fails_closed(self):
        with patch.object(main.settings, "BOT_TOKEN", ""):
            response = await self.client.post("/webhook", json={"update_id": 1})
        self.assertEqual(response.status_code, 403)
        self.dispatcher.feed_update.assert_not_awaited()

    async def test_unavailable_dispatcher_returns_retryable_error(self):
        with patch.object(main, "_dispatcher", None):
            response = await self.client.post("/webhook", headers=self.headers(), json={"update_id": 1})
        self.assertEqual(response.status_code, 503)

    async def test_processing_error_does_not_leak_update_or_credentials(self):
        self.dispatcher.feed_update.side_effect = RuntimeError("private-payload-and-token")
        with self.assertLogs(main.logger, level="ERROR") as logs:
            response = await self.client.post("/webhook", headers=self.headers(), json={"update_id": 1})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private-payload-and-token", response.text + "".join(logs.output))

    def test_secret_is_stable_domain_separated_and_rotates_with_bot_token(self):
        secret = main.settings.telegram_webhook_secret
        self.assertEqual(secret, main.settings.telegram_webhook_secret)
        self.assertRegex(secret, r"^[a-f0-9]{64}$")
        self.assertNotEqual(secret, TEST_BOT_TOKEN)
        with patch.object(main.settings, "BOT_TOKEN", "other-local-test-token"):
            self.assertNotEqual(secret, main.settings.telegram_webhook_secret)

    async def test_startup_registers_the_same_secret_without_bootstrapping_users(self):
        self.bot.set_webhook = AsyncMock()
        factory = Mock(side_effect=AssertionError("Startup must not mutate users"))
        with (
            patch.object(main, "init_db", AsyncMock()) as init_db,
            patch("app.database.async_session_factory", factory),
            patch("aiogram.Bot", return_value=self.bot),
            patch("aiogram.Dispatcher", return_value=self.dispatcher),
            patch.object(main.settings, "RAILWAY_PUBLIC_DOMAIN", "webhook.example.test"),
        ):
            async with main.lifespan(main.app):
                pass
        init_db.assert_awaited_once()
        factory.assert_not_called()
        self.bot.set_webhook.assert_awaited_once_with(
            url="https://webhook.example.test/webhook", secret_token=main.settings.telegram_webhook_secret
        )


if __name__ == "__main__":
    unittest.main()
