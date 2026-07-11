import ast
import unittest
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[1]
AUTH_PATH = REPO_ROOT / "backend" / "app" / "auth.py"
API_PATH = REPO_ROOT / "backend" / "app" / "routers" / "api.py"
ADMIN_PATH = REPO_ROOT / "backend" / "app" / "routers" / "admin.py"


class _HTTPException(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _load_active_check():
    module = ast.parse(AUTH_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name == "ensure_user_is_active"
    )
    namespace = {"HTTPException": _HTTPException}
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(AUTH_PATH), "exec"), namespace)
    return namespace["ensure_user_is_active"]


def _dependency_calls_active_check(path: Path, dependency_name: str) -> bool:
    module = ast.parse(path.read_text(encoding="utf-8"))
    dependency = next(
        node
        for node in module.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == dependency_name
    )
    return any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "ensure_user_is_active"
        for node in ast.walk(dependency)
    )


class CurrentUserAuthenticationTests(unittest.TestCase):
    def test_active_user_passes_active_check(self) -> None:
        ensure_user_is_active = _load_active_check()
        ensure_user_is_active(SimpleNamespace(is_active=True))

    def test_inactive_user_is_rejected(self) -> None:
        ensure_user_is_active = _load_active_check()

        with self.assertRaises(_HTTPException) as raised:
            ensure_user_is_active(SimpleNamespace(is_active=False))

        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(
            raised.exception.detail,
            "Пользователь деактивирован. Обратитесь к администратору.",
        )

    def test_main_current_user_dependency_enforces_active_check(self) -> None:
        self.assertTrue(_dependency_calls_active_check(API_PATH, "get_current_user"))

    def test_admin_dependency_cannot_bypass_active_check(self) -> None:
        self.assertTrue(_dependency_calls_active_check(ADMIN_PATH, "get_admin_user"))


if __name__ == "__main__":
    unittest.main()
