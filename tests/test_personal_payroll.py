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


class PersonalPayrollTests(unittest.TestCase):
    def test_personal_endpoint_uses_current_user_and_hides_unfinalized_runs(self) -> None:
        source = _endpoint_source("list_my_payroll_runs")
        self.assertIn("user: User = Depends(get_current_user)", source)
        self.assertIn("PayrollRunItem.user_id == user.id", source)
        self.assertIn("PayrollRun.status.in_((PayrollRunStatus.finalized, PayrollRunStatus.paid))", source)
        self.assertNotIn("Query", source)

    def test_personal_endpoint_returns_snapshot_values_and_filters_payments(self) -> None:
        source = _endpoint_source("list_my_payroll_runs")
        for field in (
            "final_amount=item.final_amount",
            "paid_amount=item.paid_amount",
            "remaining_amount=item.remaining_amount",
            "if payment.user_id == user.id",
        ):
            self.assertIn(field, source)
        self.assertIn("selectinload(PayrollRun.items)", source)
        self.assertIn("selectinload(PayrollRun.payments)", source)
        self.assertNotIn("calculate_payout_total", source)
        self.assertNotIn("Shift.", source)

    def test_personal_endpoint_sorts_runs_and_payments_newest_first(self) -> None:
        source = _endpoint_source("list_my_payroll_runs")
        self.assertIn("PayrollRun.period_end.desc(), PayrollRun.created_at.desc()", source)
        self.assertIn("reverse=True", source)


if __name__ == "__main__":
    unittest.main()
