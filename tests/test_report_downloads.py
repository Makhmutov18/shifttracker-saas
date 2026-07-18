import ast
import base64
import json
import logging
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import jwt
from fastapi import HTTPException
from pydantic import ValidationError


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import User, UserRole  # noqa: E402
from app.routers import api  # noqa: E402
from app.schemas import ExportDownloadLinkRequest  # noqa: E402
from tests.test_report_export import _sample_report  # noqa: E402


class FakeSession:
    def __init__(self, user: User | None):
        self.user = user

    async def get(self, model, object_id):
        if self.user is not None and self.user.id == object_id:
            return self.user
        return None


def make_user(*, can_export: bool = True, role: UserRole = UserRole.barista) -> User:
    return User(
        id=uuid.uuid4(),
        telegram_id=123,
        name="Экспорт",
        role=role,
        venue_id=uuid.uuid4(),
        hourly_rate=0,
        revenue_percentage=0,
        permissions={"can_export_payroll": can_export},
        is_active=True,
    )


class ReportDownloadTokenTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.secret_patch = patch.object(api.settings, "SECRET_KEY", "report-test-secret")
        self.url_patch = patch.object(api.settings, "WEBAPP_URL", "https://reports.example.test")
        self.secret_patch.start()
        self.url_patch.start()

    def tearDown(self) -> None:
        self.url_patch.stop()
        self.secret_patch.stop()

    def create_token(self, user: User, *, venue_id=None, now=None, export_format="xlsx") -> str:
        return api._create_export_download_token(
            user_id=user.id,
            export_format=export_format,
            month=7,
            year=2026,
            venue_id=venue_id,
            now=now,
        )

    def test_token_signature_and_expiration_are_verified(self) -> None:
        user = make_user()
        token = self.create_token(user, venue_id=user.venue_id)
        claims = api._decode_export_download_token(token)
        self.assertEqual(claims["user_id"], user.id)

        with patch.object(api.settings, "SECRET_KEY", "different-secret"):
            with self.assertRaises(jwt.InvalidSignatureError):
                api._decode_export_download_token(token)

        expired = self.create_token(
            user,
            venue_id=user.venue_id,
            now=datetime.now(timezone.utc) - timedelta(seconds=api.EXPORT_DOWNLOAD_TTL_SECONDS + 5),
        )
        with self.assertRaises(jwt.ExpiredSignatureError):
            api._decode_export_download_token(expired)

    def test_invalid_format_is_rejected_by_contract_and_token_builder(self) -> None:
        with self.assertRaises(ValidationError):
            ExportDownloadLinkRequest(format="pdf", month=7, year=2026)
        with self.assertRaises(ValueError):
            self.create_token(make_user(), export_format="pdf")

    async def test_link_uses_effective_venue_scope_and_requires_permission(self) -> None:
        user = make_user()
        requested_venue = uuid.uuid4()
        response = await api.create_export_download_link(
            ExportDownloadLinkRequest(
                format="xlsx", month=7, year=2026, venue_id=requested_venue
            ),
            user=user,
        )
        token = response.url.rsplit("/", 1)[-1]
        claims = api._decode_export_download_token(token)
        self.assertEqual(claims["venue_id"], user.venue_id)
        self.assertNotIn("initData", response.url)
        self.assertEqual(response.file_name, "Порядок.Смены — отчёт 2026-07.xlsx")

        denied = make_user(can_export=False)
        with self.assertRaises(HTTPException) as context:
            await api.create_export_download_link(
                ExportDownloadLinkRequest(format="csv", month=7, year=2026),
                user=denied,
            )
        self.assertEqual(context.exception.status_code, 403)

    def test_signed_venue_cannot_be_tampered(self) -> None:
        user = make_user()
        token = self.create_token(user, venue_id=user.venue_id)
        header, payload, signature = token.split(".")
        padded = payload + "=" * (-len(payload) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(padded))
        decoded["venue_id"] = str(uuid.uuid4())
        changed_payload = base64.urlsafe_b64encode(
            json.dumps(decoded, separators=(",", ":")).encode("utf-8")
        ).rstrip(b"=").decode("ascii")
        tampered = f"{header}.{changed_payload}.{signature}"
        with self.assertRaises(jwt.InvalidSignatureError):
            api._decode_export_download_token(tampered)

    async def test_download_rechecks_user_permission_scope_and_headers(self) -> None:
        user = make_user()
        token = self.create_token(user, venue_id=user.venue_id)
        session = FakeSession(user)
        report = _sample_report()
        with patch.object(api, "load_report_data", AsyncMock(return_value=report)) as loader:
            response = await api.download_export(token, session=session)
        loader.assert_awaited_once_with(
            session,
            month=7,
            year=2026,
            venue_id=user.venue_id,
        )
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "https://web.telegram.org",
        )
        self.assertIn("attachment", response.headers["content-disposition"])
        self.assertIn("filename*=UTF-8''", response.headers["content-disposition"])
        self.assertEqual(
            response.media_type,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        user.permissions = {"can_export_payroll": False}
        with self.assertRaises(HTTPException) as context:
            await api.download_export(token, session=session)
        self.assertEqual(context.exception.status_code, 403)

    def test_download_token_is_redacted_from_access_logs(self) -> None:
        record = logging.LogRecord(
            name="uvicorn.access",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg='%s - "%s %s HTTP/%s" %d',
            args=("127.0.0.1", "GET", "/api/export/download/secret-token", "1.1", 200),
            exc_info=None,
        )
        api.ReportDownloadAccessLogFilter().filter(record)
        self.assertEqual(record.args[2], "/api/export/download/[redacted]")

    def test_download_endpoint_has_no_unsigned_scope_parameters(self) -> None:
        source = Path(api.__file__).read_text(encoding="utf-8")
        module = ast.parse(source)
        endpoint = next(
            node for node in module.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "download_export"
        )
        parameter_names = {argument.arg for argument in endpoint.args.args}
        self.assertEqual(parameter_names, {"signed_token", "session"})


if __name__ == "__main__":
    unittest.main()
