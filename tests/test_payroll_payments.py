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


class PayrollPaymentTests(unittest.TestCase):
    def test_only_owner_and_admin_can_record_payments(self) -> None:
        source = _endpoint_source("create_payroll_payment")
        self.assertIn("UserRole.owner", source)
        self.assertIn("UserRole.admin", source)
        self.assertIn("status_code=403", source)

    def test_payment_uses_venue_scope_and_item_membership(self) -> None:
        source = _endpoint_source("create_payroll_payment")
        self.assertIn("_payroll_run_is_visible(run, user)", source)
        self.assertIn("PayrollRunItem.payroll_run_id == payroll_run_id", source)
        self.assertIn("PayrollRunItem.user_id == payment_data.user_id", source)
        self.assertIn("status_code=404", source)

    def test_payment_requires_finalized_run_and_rejects_overpayment(self) -> None:
        source = _endpoint_source("create_payroll_payment")
        self.assertIn("run.status != PayrollRunStatus.finalized", source)
        self.assertIn("amount > current_remaining", source)
        self.assertIn("new_total_paid > safe_decimal(run.total_amount)", source)
        self.assertIn("status_code=409", source)

    def test_partial_and_full_payment_update_only_payment_totals(self) -> None:
        source = _endpoint_source("create_payroll_payment")
        self.assertIn("item.paid_amount = new_paid", source)
        self.assertIn("item.remaining_amount = new_remaining", source)
        self.assertIn("run.total_paid = new_total_paid", source)
        self.assertIn("run.status = PayrollRunStatus.paid", source)
        self.assertIn("run.paid_at = datetime.now(timezone.utc)", source)
        self.assertNotIn("run.total_amount =", source)
        self.assertNotIn("item.final_amount =", source)
        self.assertNotIn("calculate_payout_total", source)
        self.assertNotIn("Shift.", source)

    def test_payment_uses_row_locks_and_is_transactional(self) -> None:
        source = _endpoint_source("create_payroll_payment")
        self.assertGreaterEqual(source.count("with_for_update()"), 3)
        self.assertIn("await session.flush()", source)
        self.assertIn("await session.commit()", source)
        self.assertIn("await session.rollback()", source)

    def test_payment_creates_payment_without_touching_expenses(self) -> None:
        source = _endpoint_source("create_payroll_payment")
        self.assertIn("payment = PayrollPayment(", source)
        self.assertIn("amount=amount", source)
        self.assertNotIn("Expense", source)
        self.assertNotIn("total_expenses", source)


if __name__ == "__main__":
    unittest.main()
