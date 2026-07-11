import ast
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.role_authorization import can_assign_owner_role  # noqa: E402


ADMIN_ROUTER_PATH = BACKEND_DIR / "app" / "routers" / "admin.py"
ADMIN_ROUTER_SOURCE = ADMIN_ROUTER_PATH.read_text(encoding="utf-8")


def _endpoint_calls_guard(endpoint_name: str) -> bool:
    module = ast.parse(ADMIN_ROUTER_SOURCE)
    endpoint = next(
        node
        for node in module.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == endpoint_name
    )
    return any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "_ensure_owner_role_assignment_allowed"
        for node in ast.walk(endpoint)
    )


class OwnerRoleAssignmentTests(unittest.TestCase):
    def test_owner_can_assign_owner(self) -> None:
        self.assertTrue(can_assign_owner_role("owner", "owner"))

    def test_admin_cannot_assign_owner(self) -> None:
        self.assertFalse(can_assign_owner_role("admin", "owner"))

    def test_team_manager_cannot_assign_owner(self) -> None:
        self.assertFalse(can_assign_owner_role("senior", "owner"))

    def test_team_managers_can_assign_regular_roles(self) -> None:
        self.assertTrue(can_assign_owner_role("admin", "senior"))
        self.assertTrue(can_assign_owner_role("senior", "barista"))

    def test_existing_owner_can_be_saved_without_being_reassigned(self) -> None:
        self.assertTrue(can_assign_owner_role("admin", "owner", current_role="owner"))

    def test_create_and_update_endpoints_use_owner_guard(self) -> None:
        self.assertTrue(_endpoint_calls_guard("create_user"))
        self.assertTrue(_endpoint_calls_guard("update_user"))

    def test_denied_owner_assignment_returns_clear_403(self) -> None:
        self.assertIn("status_code=403", ADMIN_ROUTER_SOURCE)
        self.assertIn("Только владелец может назначить роль владельца.", ADMIN_ROUTER_SOURCE)


if __name__ == "__main__":
    unittest.main()
