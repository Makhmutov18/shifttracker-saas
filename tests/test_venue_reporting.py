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

from app.schemas import AdjustmentCreate, AdjustmentOut, VenueStatsRow  # noqa: E402


API_PATH = BACKEND_DIR / "app" / "routers" / "api.py"
REPORT_EXPORT_PATH = BACKEND_DIR / "app" / "services" / "report_export.py"
API_SOURCE = API_PATH.read_text(encoding="utf-8")
API_MODULE = ast.parse(API_SOURCE)


def _endpoint_source(name: str) -> str:
    endpoint = next(
        node
        for node in API_MODULE.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name
    )
    return ast.get_source_segment(API_SOURCE, endpoint) or ""


class VenueReportingTests(unittest.TestCase):
    def test_list_and_payroll_summary_scope_by_actual_venue(self) -> None:
        for endpoint_name in ("list_shifts", "payroll_summary"):
            source = _endpoint_source(endpoint_name)
            self.assertIn("Shift.venue_id", source)
            self.assertNotIn("User.venue_id == venue_id", source)
            self.assertNotIn("or_(", source)

    def test_payroll_preview_and_run_sources_use_actual_venue(self) -> None:
        preview_source = _endpoint_source("payroll_run_preview")
        create_source = _endpoint_source("create_payroll_run")
        self.assertIn("Shift.venue_id == venue_id", preview_source)
        self.assertIn("Adjustment.venue_id == venue_id", preview_source)
        self.assertIn('"Несколько точек"', preview_source)
        self.assertIn("Shift.venue_id == payroll_data.venue_id", create_source)
        self.assertIn("Adjustment.venue_id == payroll_data.venue_id", create_source)
        self.assertNotIn("User.venue_id == payroll_data.venue_id", create_source)

    def test_export_uses_actual_shift_and_adjustment_venues(self) -> None:
        source = REPORT_EXPORT_PATH.read_text(encoding="utf-8")
        self.assertIn("Shift.venue_id == venue_id", source)
        self.assertIn("Adjustment.venue_id == venue_id", source)
        self.assertNotIn("User.venue_id == venue_id", source)
        self.assertIn('work_venue = getattr(shift, "venue", None)', source)
        self.assertIn('home_venue = getattr(employee, "venue", None)', source)
        self.assertIn('"work_venue"', source)
        self.assertIn('"home_venue"', source)

    def test_adjustment_contract_and_scope_use_adjustment_venue(self) -> None:
        venue_id = uuid.uuid4()
        payload = AdjustmentCreate(
            user_id=uuid.uuid4(),
            type="bonus",
            amount=Decimal("100.00"),
            reason="Премия",
            venue_id=venue_id,
        )
        self.assertEqual(payload.venue_id, venue_id)
        self.assertIn("venue_id", AdjustmentOut.model_fields)
        self.assertIn("venue_name", AdjustmentOut.model_fields)

        source = _endpoint_source("create_adjustment")
        self.assertIn("adjustment_data.venue_id or user.venue_id", source)
        self.assertIn("await _get_active_venue", source)
        self.assertIn("venue_id=adjustment.venue_id", source)
        self.assertIn('"venue_id": str(adjustment.venue_id)', source)

    def test_venue_stats_contract_contains_required_actual_venue_metrics(self) -> None:
        expected_fields = {
            "assigned_employees_count",
            "worked_employees_count",
            "approved_shifts_count",
            "pending_shifts_count",
            "approved_hours",
            "shift_accruals",
            "bonuses",
            "deductions",
            "total_accruals",
        }
        self.assertTrue(expected_fields.issubset(VenueStatsRow.model_fields))
        self.assertNotIn("revenue", VenueStatsRow.model_fields)
        self.assertNotIn("payroll_share_percent", VenueStatsRow.model_fields)

    def test_venue_stats_aggregate_correct_sources_without_n_plus_one(self) -> None:
        source = _endpoint_source("list_venue_stats")
        self.assertIn("User.venue_id", source)
        self.assertIn("User.is_active == True", source)
        self.assertIn("Shift.venue_id", source)
        self.assertIn("Adjustment.venue_id", source)
        self.assertIn('Shift.status == "approved"', source)
        self.assertIn('Shift.status == "pending"', source)
        self.assertIn("func.distinct", source)
        self.assertIn("calculate_payout_total", source)
        self.assertNotIn("Shift.revenue", source)
        self.assertNotIn("payroll_share_percent", source)
        self.assertNotIn("Expense", source)
        self.assertNotIn("await session.execute", source[source.index("for venue in venues:"):])

    def test_shift_revenue_and_salary_calculation_remain_available(self) -> None:
        shift_source = (BACKEND_DIR / "app" / "models.py").read_text(encoding="utf-8")
        utils_source = (BACKEND_DIR / "app" / "utils.py").read_text(encoding="utf-8")
        self.assertIn("revenue: Mapped[Optional[Decimal]]", shift_source)
        self.assertIn("def calculate_salary", utils_source)
        self.assertIn('pay_model == "revenue"', utils_source)
        self.assertIn('pay_model == "hybrid"', utils_source)
        self.assertIn("revenue * revenue_percentage", utils_source)

    def test_personal_monthly_stats_remain_cross_venue(self) -> None:
        source = _endpoint_source("monthly_stats")
        self.assertIn("Shift.user_id == user.id", source)
        self.assertNotIn("Shift.venue_id", source)
        self.assertNotIn("User.venue_id", source)


if __name__ == "__main__":
    unittest.main()
