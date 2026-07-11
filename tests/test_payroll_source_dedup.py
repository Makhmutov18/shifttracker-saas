import ast
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
API_PATH = REPO_ROOT / "backend" / "app" / "routers" / "api.py"
MODELS_PATH = REPO_ROOT / "backend" / "app" / "models.py"
API_SOURCE = API_PATH.read_text(encoding="utf-8")
MODEL_SOURCE = MODELS_PATH.read_text(encoding="utf-8")
API_MODULE = ast.parse(API_SOURCE)


def _endpoint_source(endpoint_name: str) -> str:
    endpoint = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == endpoint_name
    )
    return ast.get_source_segment(API_SOURCE, endpoint) or ""


class PayrollSourceDedupTests(unittest.TestCase):
    def test_source_link_models_store_shift_and_adjustment_ids(self) -> None:
        self.assertIn("class PayrollRunShiftSource", MODEL_SOURCE)
        self.assertIn("shift_id: Mapped[uuid.UUID]", MODEL_SOURCE)
        self.assertIn("class PayrollRunAdjustmentSource", MODEL_SOURCE)
        self.assertIn("adjustment_id: Mapped[uuid.UUID]", MODEL_SOURCE)
        self.assertIn('ForeignKey("shifts.id")', MODEL_SOURCE)
        self.assertIn('ForeignKey("adjustments.id")', MODEL_SOURCE)

    def test_only_active_runs_conflict_on_sources(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertIn("PayrollRunStatus.draft", source)
        self.assertIn("PayrollRunStatus.finalized", source)
        self.assertIn("PayrollRunStatus.paid", source)
        self.assertIn("PayrollRun.status.in_(active_run_statuses)", source)
        self.assertNotIn("PayrollRunStatus.cancelled", source)

    def test_conflicting_sources_return_409_before_creation(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertIn("An approved shift is already included in another payroll run", source)
        self.assertIn("An adjustment is already included in another payroll run", source)
        self.assertIn("session.add(payroll_run)", source)
        self.assertLess(
            source.index("An approved shift is already included in another payroll run"),
            source.index("session.add(payroll_run)"),
        )

    def test_source_links_are_created_in_same_transaction(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertIn("payroll_run.shift_sources", source)
        self.assertIn("payroll_run.adjustment_sources", source)
        self.assertIn("await session.flush()", source)
        self.assertIn("await session.commit()", source)
        self.assertIn("await session.rollback()", source)

    def test_period_overlap_is_not_the_source_conflict_rule(self) -> None:
        source = _endpoint_source("create_payroll_run")
        self.assertNotIn("period_start == payroll_data.period_start", source)
        self.assertNotIn("period_end == payroll_data.period_end", source)


if __name__ == "__main__":
    unittest.main()
