import ast
import unittest
from enum import Enum
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[1]
API_PATH = REPO_ROOT / "backend" / "app" / "routers" / "api.py"
NOTIFICATIONS_PATH = REPO_ROOT / "backend" / "app" / "notifications.py"
API_SOURCE = API_PATH.read_text(encoding="utf-8")
API_MODULE = ast.parse(API_SOURCE)


class _UserRole(str, Enum):
    owner = "owner"
    admin = "admin"
    senior = "senior"
    barista = "barista"


def _has_permission(user: object, permission_name: str) -> bool:
    return bool(getattr(user, "permissions", {}).get(permission_name, False))


def _load_reminder_policy():
    function = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.FunctionDef) and node.name == "_can_send_shift_reminders"
    )
    namespace = {
        "User": object,
        "UserRole": _UserRole,
        "has_permission": _has_permission,
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(API_PATH), "exec"), namespace)
    return namespace["_can_send_shift_reminders"]


def _endpoint_source(endpoint_name: str) -> str:
    endpoint = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == endpoint_name
    )
    return ast.get_source_segment(API_SOURCE, endpoint) or ""


class ReminderAccessTests(unittest.TestCase):
    def test_employee_cannot_send_shift_reminders(self) -> None:
        can_send = _load_reminder_policy()
        user = SimpleNamespace(role=_UserRole.barista, permissions={})
        self.assertFalse(can_send(user))

    def test_owner_and_admin_can_send_shift_reminders(self) -> None:
        can_send = _load_reminder_policy()
        self.assertTrue(can_send(SimpleNamespace(role=_UserRole.owner, permissions={})))
        self.assertTrue(can_send(SimpleNamespace(role=_UserRole.admin, permissions={})))

    def test_team_manager_can_send_shift_reminders(self) -> None:
        can_send = _load_reminder_policy()
        user = SimpleNamespace(
            role=_UserRole.senior,
            permissions={"can_manage_team": True},
        )
        self.assertTrue(can_send(user))

    def test_reminder_endpoint_requires_current_user_and_returns_403_when_denied(self) -> None:
        source = _endpoint_source("send_shift_reminders")
        self.assertIn("Depends(get_current_user)", source)
        self.assertIn("_can_send_shift_reminders(user)", source)
        self.assertIn("status_code=403", source)

    def test_current_user_rejects_missing_init_data_with_401(self) -> None:
        dependency = next(
            node
            for node in API_MODULE.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "get_current_user"
        )
        source = ast.get_source_segment(API_SOURCE, dependency) or ""
        self.assertIn("Header(None, alias=\"X-Init-Data\")", source)
        self.assertIn("if not init_data or not validate_init_data(init_data)", source)
        self.assertIn("status_code=401", source)

    def test_notification_sender_remains_independent_of_http_auth(self) -> None:
        notifications_module = ast.parse(NOTIFICATIONS_PATH.read_text(encoding="utf-8"))
        sender = next(
            node
            for node in notifications_module.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "send_shift_reminder"
        )
        self.assertEqual([argument.arg for argument in sender.args.args], ["telegram_id"])


if __name__ == "__main__":
    unittest.main()
