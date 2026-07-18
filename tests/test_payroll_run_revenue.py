import ast
import sys
import unittest
import uuid
from decimal import Decimal
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.schemas import (  # noqa: E402
    PayrollRunCreate,
    PayrollRunListItem,
    PayrollRunRead,
    PersonalPayrollRunRead,
)


API_PATH = BACKEND_DIR / "app" / "routers" / "api.py"
API_SOURCE = API_PATH.read_text(encoding="utf-8")
API_MODULE = ast.parse(API_SOURCE)
UTILS_PATH = BACKEND_DIR / "app" / "utils.py"
UTILS_SOURCE = UTILS_PATH.read_text(encoding="utf-8")
UTILS_MODULE = ast.parse(UTILS_SOURCE)


def _load_payroll_share_helper():
    function_nodes = [
        node
        for node in UTILS_MODULE.body
        if isinstance(node, ast.FunctionDef)
        and node.name in {"safe_decimal", "calculate_payroll_share"}
    ]
    module = ast.Module(
        body=[
            ast.ImportFrom(
                module="decimal",
                names=[
                    ast.alias(name="Decimal"),
                    ast.alias(name="ROUND_HALF_UP"),
                ],
                level=0,
            ),
            *function_nodes,
        ],
        type_ignores=[],
    )
    namespace: dict[str, object] = {}
    exec(compile(ast.fix_missing_locations(module), str(UTILS_PATH), "exec"), namespace)
    return namespace["calculate_payroll_share"]


calculate_payroll_share = _load_payroll_share_helper()


def _endpoint_source(endpoint_name: str) -> str:
    endpoint = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == endpoint_name
    )
    return ast.get_source_segment(API_SOURCE, endpoint) or ""


class PayrollRunRevenueTests(unittest.TestCase):
    def test_schema_is_backward_compatible_and_management_only(self) -> None:
        payload = PayrollRunCreate(
            period_start="2026-07-01",
            period_end="2026-07-15",
        )
        self.assertIsNone(payload.revenue_total)
        self.assertIn("revenue_total", PayrollRunRead.model_fields)
        self.assertIn("payroll_share_percent", PayrollRunRead.model_fields)
        self.assertIn("revenue_total", PayrollRunListItem.model_fields)
        self.assertNotIn("revenue_total", PersonalPayrollRunRead.model_fields)
        self.assertNotIn("payroll_share_percent", PersonalPayrollRunRead.model_fields)

    def test_payroll_share_uses_decimal_round_half_up(self) -> None:
        self.assertIsNone(calculate_payroll_share(Decimal("100"), None))
        self.assertIsNone(calculate_payroll_share(Decimal("100"), Decimal("0")))
        self.assertEqual(
            calculate_payroll_share(Decimal("1"), Decimal("6")),
            Decimal("16.67"),
        )

    def test_create_saves_revenue_without_changing_preview_snapshot(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertIn("revenue_total=revenue_total", source)
        self.assertIn("preview.total_amount", source)
        self.assertIn("preview.rows", source)
        self.assertIn('.quantize(', source)
        self.assertIn('Decimal("0.01"), rounding=ROUND_HALF_UP', source)
        self.assertIn("payroll_data.venue_id is None", source)
        self.assertIn("status_code=422", source)
        self.assertNotIn("Shift.revenue", source)

    def test_management_read_uses_saved_revenue_and_helper(self) -> None:
        for endpoint_name in ("list_payroll_runs", "get_payroll_run"):
            source = _endpoint_source(endpoint_name)
            self.assertIn("run.revenue_total", source)
            self.assertIn("calculate_payroll_share", source)
            self.assertNotIn("Shift.revenue", source)

        personal_source = _endpoint_source("list_my_payroll_runs")
        self.assertNotIn("revenue_total", personal_source)
        self.assertNotIn("payroll_share_percent", personal_source)

    def test_update_revenue_is_draft_owner_admin_and_venue_scoped(self) -> None:
        source = _endpoint_source("update_payroll_run_revenue")
        self.assertIn("UserRole.owner", source)
        self.assertIn("UserRole.admin", source)
        self.assertIn("status_code=403", source)
        self.assertIn("_payroll_run_is_visible(run, user)", source)
        self.assertIn("run.venue_id is None", source)
        self.assertIn("run.status != PayrollRunStatus.draft", source)
        self.assertIn("status_code=409", source)
        self.assertIn("revenue_data.revenue_total is not None", source)
        self.assertIn("else None", source)
        self.assertNotIn("run.total_amount =", source)
        self.assertNotIn("PayrollRunItem", source)

    def test_update_revenue_writes_non_blocking_audit(self) -> None:
        source = _endpoint_source("update_payroll_run_revenue")
        self.assertIn('action="payroll_revenue_updated"', source)
        self.assertIn('entity_type="payroll_run"', source)
        self.assertIn('"revenue_total"', source)
        self.assertIn('"payroll_share_percent"', source)
        self.assertIn("previous_revenue", source)
        self.assertIn("logger.exception", source)
        self.assertGreaterEqual(source.count("await session.commit()"), 2)
        self.assertIn("await session.rollback()", source)

    def test_model_and_migration_preserve_existing_runs(self) -> None:
        model_source = (BACKEND_DIR / "app" / "models.py").read_text(encoding="utf-8")
        migration_path = BACKEND_DIR / "app" / "migrations" / "20260718_add_payroll_run_revenue.sql"
        migration_source = migration_path.read_text(encoding="utf-8")
        self.assertIn("Numeric(14, 2), nullable=True", model_source)
        self.assertIn("ADD COLUMN IF NOT EXISTS revenue_total NUMERIC(14,2)", migration_source)
        self.assertNotIn("DROP", migration_source.upper())

    def test_create_accepts_revenue_for_specific_venue(self) -> None:
        venue_id = uuid.uuid4()
        payload = PayrollRunCreate(
            period_start="2026-07-01",
            period_end="2026-07-15",
            venue_id=venue_id,
            revenue_total=Decimal("850000.12"),
        )
        self.assertEqual(payload.venue_id, venue_id)
        self.assertEqual(payload.revenue_total, Decimal("850000.12"))


if __name__ == "__main__":
    unittest.main()
