import sys
import unittest
from pathlib import Path

from sqlalchemy.engine import make_url


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.integration_database import database_identity, validate_test_database_url


TEST_URL = "postgresql+asyncpg://test_user:test_password@127.0.0.1:55432/shifttracker_test"


class IntegrationDatabaseSafetyTests(unittest.TestCase):
    def test_disposable_postgresql_requires_explicit_reset_permission(self):
        with self.assertRaises(ValueError):
            validate_test_database_url(TEST_URL)
        self.assertEqual(validate_test_database_url(TEST_URL, allow_reset=True), TEST_URL)

    def test_rejects_missing_non_postgresql_and_non_test_database(self):
        for value in ("", "invalid", "sqlite:///test.db", TEST_URL.replace("shifttracker_test", "contest")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_test_database_url(value, allow_reset=True)

    def test_driver_credentials_and_loopback_alias_do_not_hide_same_database(self):
        configured = "postgresql://different:secret@localhost:55432/shifttracker_test"
        with self.assertRaisesRegex(ValueError, "configured DATABASE_URL"):
            validate_test_database_url(TEST_URL, configured_url=configured, allow_reset=True)

    def test_distinct_host_port_or_database_is_not_same_target(self):
        for configured in (
            "postgresql://user:secret@other-host:55432/shifttracker_test",
            TEST_URL.replace("55432", "55433"),
            TEST_URL.replace("shifttracker_test", "other_test"),
        ):
            with self.subTest(configured=configured):
                self.assertEqual(
                    validate_test_database_url(TEST_URL, configured_url=configured, allow_reset=True), TEST_URL,
                )

    def test_query_overrides_and_missing_hostname_are_rejected(self):
        for value in (TEST_URL + "?database=production", "postgresql:///shifttracker_test"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_test_database_url(value, allow_reset=True)

    def test_default_port_and_url_objects_have_consistent_identity(self):
        self.assertEqual(
            database_identity("postgresql://u:p@localhost/shifttracker_test"),
            database_identity(make_url("postgresql+asyncpg://u:other@127.0.0.1:5432/shifttracker_test")),
        )

    def test_invalid_url_does_not_leak_credentials_in_error(self):
        with self.assertRaises(ValueError) as error:
            validate_test_database_url("not-a-url-secret", allow_reset=True)
        self.assertNotIn("not-a-url-secret", str(error.exception))
