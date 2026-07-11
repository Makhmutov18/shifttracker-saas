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


class PayrollRunReadTests(unittest.TestCase):
    def test_list_and_detail_use_payroll_permission(self) -> None:
        for endpoint_name in ("list_payroll_runs", "get_payroll_run"):
            source = _endpoint_source(endpoint_name)
            self.assertIn("_can_view_payroll_runs(user)", source)
            self.assertIn("status_code=403", source)

    def test_list_returns_saved_draft_and_respects_venue_scope(self) -> None:
        source = _endpoint_source("list_payroll_runs")
        self.assertIn("selectinload(PayrollRun.items)", source)
        self.assertIn("PayrollRun.venue_id == venue_id", source)
        self.assertIn("PayrollRun.venue_id == user.venue_id", source)
        self.assertIn("employees_count=len(run.items)", source)
        self.assertIn("total_amount=run.total_amount", source)

    def test_detail_returns_saved_items_without_recalculation(self) -> None:
        source = _endpoint_source("get_payroll_run")
        self.assertIn("selectinload(PayrollRun.items).selectinload(PayrollRunItem.user)", source)
        for field in (
            "approved_hours=item.approved_hours",
            "base_amount=item.base_amount",
            "bonus_amount=item.bonus_amount",
            "deduction_amount=item.deduction_amount",
            "final_amount=item.final_amount",
            "paid_amount=item.paid_amount",
            "remaining_amount=item.remaining_amount",
        ):
            self.assertIn(field, source)
        self.assertNotIn("calculate_payout_total", source)
        self.assertNotIn("Shift.", source)
        self.assertIn("status_code=404", source)

    def test_detail_does_not_lazy_load_or_expose_payments_as_required(self) -> None:
        source = _endpoint_source("get_payroll_run")
        self.assertIn("selectinload(PayrollRun.payments)", source)
        self.assertIn("payments=[", source)


if __name__ == "__main__":
    unittest.main()
