import ast
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
API_PATH = REPO_ROOT / "backend" / "app" / "routers" / "api.py"
SCHEMAS_PATH = REPO_ROOT / "backend" / "app" / "schemas.py"
API_SOURCE = API_PATH.read_text(encoding="utf-8")
API_MODULE = ast.parse(API_SOURCE)


def _preview_source() -> str:
    endpoint = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "payroll_run_preview"
    )
    return ast.get_source_segment(API_SOURCE, endpoint) or ""


class PayrollPreviewTests(unittest.TestCase):
    def test_preview_uses_approved_shifts_only(self) -> None:
        source = _preview_source()
        self.assertIn('Shift.status == "approved"', source)
        self.assertIn("Shift.date >= period_start", source)
        self.assertIn("Shift.date <= period_end", source)

    def test_preview_applies_bonuses_and_deductions(self) -> None:
        source = _preview_source()
        self.assertIn("AdjustmentType.bonus", source)
        self.assertIn('row["bonuses"]', source)
        self.assertIn('row["deductions"]', source)
        self.assertIn("calculate_payout_total(", source)

    def test_preview_does_not_use_expenses(self) -> None:
        source = _preview_source()
        self.assertNotIn("Expense", source)
        self.assertNotIn("total_expenses", source)

    def test_preview_uses_current_payroll_permission(self) -> None:
        source = _preview_source()
        self.assertIn('has_permission(user, "can_view_team_payroll")', source)
        self.assertIn("status_code=403", source)

    def test_preview_supports_venue_scope_and_eager_loads_venues(self) -> None:
        source = _preview_source()
        self.assertIn("venue_id", source)
        self.assertIn("Shift.venue_id == venue_id", source)
        self.assertIn("User.venue_id == venue_id", source)
        self.assertIn("selectinload(Shift.venue)", source)
        self.assertIn("selectinload(User.venue)", source)

    def test_preview_is_read_only(self) -> None:
        source = _preview_source()
        self.assertNotIn("session.add", source)
        self.assertNotIn("session.commit", source)
        self.assertNotIn("PayrollRun", source)
        self.assertNotIn("PayrollPayment", source)

    def test_preview_response_contains_period_rows_and_totals(self) -> None:
        source = SCHEMAS_PATH.read_text(encoding="utf-8")
        self.assertIn("class PayrollPreviewRow", source)
        self.assertIn("class PayrollPreviewOut", source)
        for field in (
            "period_start",
            "period_end",
            "base_amount",
            "deductions",
            "total_amount",
        ):
            self.assertIn(field, source)


if __name__ == "__main__":
    unittest.main()
