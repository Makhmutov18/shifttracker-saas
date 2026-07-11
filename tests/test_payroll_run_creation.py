import ast
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
API_PATH = REPO_ROOT / "backend" / "app" / "routers" / "api.py"
API_SOURCE = API_PATH.read_text(encoding="utf-8")
API_MODULE = ast.parse(API_SOURCE)


def _endpoint_source(endpoint_name: str) -> str:
    endpoint = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == endpoint_name
    )
    return ast.get_source_segment(API_SOURCE, endpoint) or ""


class PayrollRunCreationTests(unittest.TestCase):
    def test_creation_is_owner_admin_only(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertIn("UserRole.owner", source)
        self.assertIn("UserRole.admin", source)
        self.assertIn("status_code=403", source)

    def test_creation_reuses_preview_and_persists_item_snapshot(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertIn("await payroll_run_preview(", source)
        for field in (
            "base_amount=row.base_amount",
            "bonus_amount=row.bonuses",
            "deduction_amount=row.deductions",
            "final_amount=row.total_amount",
            "approved_hours=row.total_hours",
            "approved_shifts_count=row.shifts_count",
        ):
            self.assertIn(field, source)

    def test_creation_does_not_create_payments_and_starts_as_draft(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertIn("status=PayrollRunStatus.draft", source)
        self.assertIn('total_paid=Decimal("0.00")', source)
        self.assertIn('paid_amount=Decimal("0.00")', source)
        self.assertIn("PayrollRunItem", source)
        self.assertNotIn("PayrollPayment(", source)

    def test_creation_deduplicates_sources_not_periods(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertIn("source_shift_ids", source)
        self.assertIn("source_adjustment_ids", source)
        self.assertIn("PayrollRunShiftSource.shift_id.in_(source_shift_ids)", source)
        self.assertIn("PayrollRunAdjustmentSource.adjustment_id.in_(source_adjustment_ids)", source)
        self.assertIn("PayrollRunStatus.draft", source)
        self.assertIn("PayrollRunStatus.finalized", source)
        self.assertIn("PayrollRunStatus.paid", source)
        self.assertIn("status_code=409", source)
        self.assertNotIn("An active payroll run already exists for this period and venue", source)

    def test_creation_rolls_back_on_failure(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertIn("await session.flush()", source)
        self.assertIn("await session.commit()", source)
        self.assertIn("await session.rollback()", source)

    def test_creation_uses_preview_rules_and_does_not_use_expenses(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertNotIn("Expense", source)
        self.assertNotIn("total_expenses", source)
        self.assertIn("preview.total_amount", source)
        self.assertIn("preview.rows", source)
        self.assertIn("payroll_run.shift_sources", source)
        self.assertIn("payroll_run.adjustment_sources", source)


if __name__ == "__main__":
    unittest.main()
