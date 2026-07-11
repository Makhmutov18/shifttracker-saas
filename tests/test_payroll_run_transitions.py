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


class PayrollRunTransitionTests(unittest.TestCase):
    def test_only_owner_and_admin_can_finalize_or_cancel(self) -> None:
        for endpoint_name in ("finalize_payroll_run", "cancel_payroll_run"):
            source = _endpoint_source(endpoint_name)
            self.assertIn("UserRole.owner", source)
            self.assertIn("UserRole.admin", source)
            self.assertIn("status_code=403", source)

    def test_transition_endpoints_respect_venue_scope_and_unknown_id(self) -> None:
        for endpoint_name in ("finalize_payroll_run", "cancel_payroll_run"):
            source = _endpoint_source(endpoint_name)
            self.assertIn("_payroll_run_is_visible(run, user)", source)
            self.assertIn("status_code=404", source)

    def test_finalize_only_allows_draft_and_keeps_snapshot(self) -> None:
        source = _endpoint_source("finalize_payroll_run")
        self.assertIn("run.status != PayrollRunStatus.draft", source)
        self.assertIn("run.status = PayrollRunStatus.finalized", source)
        self.assertIn("run.finalized_at = datetime.now(timezone.utc)", source)
        self.assertNotIn("calculate_payout_total", source)
        self.assertNotIn("PayrollRunItem(", source)
        self.assertNotIn("PayrollPayment(", source)
        self.assertIn("status_code=409", source)

    def test_cancel_supports_draft_and_finalized_without_payments(self) -> None:
        source = _endpoint_source("cancel_payroll_run")
        self.assertIn("run.status == PayrollRunStatus.paid", source)
        self.assertIn("run.status == PayrollRunStatus.cancelled", source)
        self.assertIn("run.status == PayrollRunStatus.finalized and run.payments", source)
        self.assertIn("run.status = PayrollRunStatus.cancelled", source)
        self.assertIn("status_code=409", source)

    def test_transitions_are_transactional_and_return_saved_detail(self) -> None:
        for endpoint_name in ("finalize_payroll_run", "cancel_payroll_run"):
            source = _endpoint_source(endpoint_name)
            self.assertIn("await session.commit()", source)
            self.assertIn("await session.rollback()", source)
            self.assertIn("await get_payroll_run(", source)
            self.assertNotIn("session.delete", source)


if __name__ == "__main__":
    unittest.main()
