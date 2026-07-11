import ast
import unittest
from enum import Enum
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[1]
API_PATH = REPO_ROOT / "backend" / "app" / "routers" / "api.py"
API_SOURCE = API_PATH.read_text(encoding="utf-8")
API_MODULE = ast.parse(API_SOURCE)


class _UserRole(str, Enum):
    owner = "owner"
    admin = "admin"
    senior = "senior"
    barista = "barista"


def _has_permission(user: object, permission_name: str) -> bool:
    return bool(getattr(user, "permissions", {}).get(permission_name, False))


def _load_general_audit_policy():
    function = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.FunctionDef) and node.name == "_can_view_general_audit"
    )
    namespace = {
        "User": object,
        "UserRole": _UserRole,
        "has_permission": _has_permission,
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(API_PATH), "exec"), namespace)
    return namespace["_can_view_general_audit"]


def _endpoint_source(endpoint_name: str) -> str:
    endpoint = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == endpoint_name
    )
    return ast.get_source_segment(API_SOURCE, endpoint) or ""


class AuditAccessTests(unittest.TestCase):
    def test_employee_cannot_view_general_audit(self) -> None:
        can_view = _load_general_audit_policy()
        user = SimpleNamespace(role=_UserRole.barista, permissions={})
        self.assertFalse(can_view(user))

    def test_owner_and_admin_can_view_general_audit(self) -> None:
        can_view = _load_general_audit_policy()
        self.assertTrue(can_view(SimpleNamespace(role=_UserRole.owner, permissions={})))
        self.assertTrue(can_view(SimpleNamespace(role=_UserRole.admin, permissions={})))

    def test_team_manager_can_view_general_audit(self) -> None:
        can_view = _load_general_audit_policy()
        user = SimpleNamespace(
            role=_UserRole.senior,
            permissions={"can_manage_team": True},
        )
        self.assertTrue(can_view(user))

    def test_general_audit_endpoint_enforces_policy_with_403(self) -> None:
        source = _endpoint_source("list_audit_logs")
        self.assertIn("_can_view_general_audit(user)", source)
        self.assertIn("status_code=403", source)

    def test_personal_audit_remains_scoped_to_current_user(self) -> None:
        source = _endpoint_source("list_my_audit_log")
        self.assertIn("AuditLog.target_user_id == user.id", source)
        self.assertIn('AuditLog.entity_type.in_(("user", "shift"))', source)

    def test_personal_audit_does_not_use_venue_wide_scope(self) -> None:
        source = _endpoint_source("list_my_audit_log")
        self.assertNotIn("AuditLog.venue_id == user.venue_id", source)


if __name__ == "__main__":
    unittest.main()
