import inspect
import unittest
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

from app.models import UserRole
from app.scripts import seed_demo_company as seeder


FIXED_DATE = date(2026, 7, 18)


class DemoCompanyGeneratorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dataset = seeder.generate_demo_dataset(FIXED_DATE)

    def test_generation_is_deterministic(self):
        repeated = seeder.generate_demo_dataset(FIXED_DATE)

        self.assertEqual(self.dataset, repeated)
        self.assertEqual(
            [entity.id for entity in self.dataset.shifts],
            [entity.id for entity in repeated.shifts],
        )

    def test_range_is_exactly_thirty_days_and_has_no_future_shifts(self):
        self.assertEqual(self.dataset.end_date, FIXED_DATE)
        self.assertEqual(self.dataset.start_date, FIXED_DATE - timedelta(days=29))
        self.assertTrue(all(shift.work_date <= FIXED_DATE for shift in self.dataset.shifts))

    def test_company_shape_and_employee_privacy(self):
        self.assertEqual(len(self.dataset.venues), 2)
        self.assertEqual(len(self.dataset.employees), 12)
        self.assertEqual(Counter(employee.role for employee in self.dataset.employees), {
            "senior": 2,
            "barista": 8,
            "cook": 2,
        })
        self.assertEqual(Counter(employee.venue_id for employee in self.dataset.employees), {
            self.dataset.venues[0].id: 6,
            self.dataset.venues[1].id: 6,
        })
        self.assertTrue(all(employee.telegram_id is None for employee in self.dataset.employees))

    def test_employee_has_at_most_one_shift_per_date(self):
        keys = [(shift.user_id, shift.work_date) for shift in self.dataset.shifts]

        self.assertEqual(len(keys), len(set(keys)))

    def test_status_distribution_is_within_requested_ranges(self):
        counts = Counter(shift.status for shift in self.dataset.shifts)
        total = len(self.dataset.shifts)

        self.assertGreaterEqual(total, 190)
        self.assertLessEqual(total, 240)
        self.assertGreaterEqual(counts["approved"] / total, 0.88)
        self.assertLessEqual(counts["approved"] / total, 0.92)
        self.assertGreaterEqual(counts["pending"] / total, 0.05)
        self.assertLessEqual(counts["pending"] / total, 0.08)
        self.assertGreaterEqual(counts["rejected"] / total, 0.02)
        self.assertLessEqual(counts["rejected"] / total, 0.04)

    def test_current_week_has_management_signals(self):
        metrics = seeder.calculate_dataset_metrics(
            self.dataset,
            self.dataset.current_week_start,
            self.dataset.end_date,
        )
        worked = [
            shift
            for shift in self.dataset.shifts
            if shift.work_date >= self.dataset.current_week_start
            and shift.status in {"approved", "pending"}
        ]
        venue_counts = Counter(shift.venue_id for shift in worked)
        stronger, weaker = sorted(venue_counts.values(), reverse=True)

        self.assertGreaterEqual(metrics["approved"], 32)
        self.assertLessEqual(metrics["approved"], 45)
        self.assertGreaterEqual(metrics["pending"], 4)
        self.assertLessEqual(metrics["pending"], 6)
        self.assertGreaterEqual(metrics["rejected"], 1)
        self.assertLessEqual(metrics["rejected"], 2)
        self.assertGreaterEqual(metrics["unique_employees"], 8)
        self.assertLessEqual(metrics["unique_employees"], 11)
        self.assertGreaterEqual(metrics["cross_venue_shifts"], 5)
        self.assertLessEqual(metrics["cross_venue_shifts"], 8)
        self.assertEqual(metrics["draft_payroll_runs"], 2)
        self.assertGreater(metrics["finalized_unpaid_runs"], 0)
        self.assertEqual(set(venue_counts), {venue.id for venue in self.dataset.venues})
        self.assertGreaterEqual(Decimal(str(stronger / weaker)), Decimal("1.25"))
        self.assertLessEqual(Decimal(str(stronger / weaker)), Decimal("1.40"))

    def test_cross_venue_metrics_exclude_rejected_shifts(self):
        employee_by_id = {employee.id: employee for employee in self.dataset.employees}
        cross_shift = next(
            shift
            for shift in self.dataset.shifts
            if shift.work_date >= self.dataset.current_week_start
            and shift.status in {"approved", "pending"}
            and shift.venue_id != employee_by_id[shift.user_id].venue_id
        )
        employee_shifts = [
            shift
            for shift in self.dataset.shifts
            if shift.work_date >= self.dataset.current_week_start
            and shift.user_id == cross_shift.user_id
        ]
        original_statuses = {shift.id: shift.status for shift in employee_shifts}
        worked_cross_count = sum(
            shift.status in {"approved", "pending"}
            and shift.venue_id != employee_by_id[shift.user_id].venue_id
            for shift in employee_shifts
        )
        before = seeder.calculate_dataset_metrics(
            self.dataset,
            self.dataset.current_week_start,
            self.dataset.end_date,
        )

        for shift in employee_shifts:
            shift.status = "rejected"
        after = seeder.calculate_dataset_metrics(
            self.dataset,
            self.dataset.current_week_start,
            self.dataset.end_date,
        )
        for shift in employee_shifts:
            shift.status = original_statuses[shift.id]

        self.assertEqual(after["unique_employees"], before["unique_employees"] - 1)
        self.assertEqual(
            after["cross_venue_shifts"],
            before["cross_venue_shifts"] - worked_cross_count,
        )

    def test_payroll_snapshots_and_sources_are_consistent(self):
        seeder.validate_demo_dataset(self.dataset)
        shift_sources = []
        adjustment_sources = []

        for run in self.dataset.payroll_runs:
            self.assertEqual(
                run.total_amount,
                seeder.money(sum((item.final_amount for item in run.items), Decimal("0"))),
            )
            self.assertEqual(
                run.total_paid,
                seeder.money(sum((item.paid_amount for item in run.items), Decimal("0"))),
            )
            self.assertLessEqual(run.total_paid, run.total_amount)
            shift_sources.extend(run.shift_ids)
            adjustment_sources.extend(run.adjustment_ids)

        self.assertEqual(len(shift_sources), len(set(shift_sources)))
        self.assertEqual(len(adjustment_sources), len(set(adjustment_sources)))

    def test_owner_admin_preservation_policy_is_exact(self):
        self.assertTrue(seeder.should_preserve_user(UserRole.owner))
        self.assertTrue(seeder.should_preserve_user(UserRole.admin))
        self.assertFalse(seeder.should_preserve_user(UserRole.senior))
        self.assertFalse(seeder.should_preserve_user(UserRole.barista))

    def test_module_does_not_import_or_call_ai_provider(self):
        source = inspect.getsource(seeder)

        self.assertNotIn("ai_summary", source)
        self.assertNotIn("generate_weekly_summary", source)
        self.assertNotIn("DeepSeek", source)
        self.assertNotIn("httpx", source)

    def test_dry_run_output_does_not_expose_secrets(self):
        output = []
        counts = {name: 0 for name, _ in seeder.TABLE_MODELS}
        counts["preserved_owner_admin"] = 1

        seeder.print_dry_run(counts, self.dataset, output.append)
        text = "\n".join(output)

        self.assertNotIn("DATABASE_URL", text)
        self.assertNotIn("postgresql://", text)
        self.assertNotIn("DEEPSEEK", text)
        self.assertIn(seeder.CONFIRMATION_PHRASE, text)


class DemoCompanyCliSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_dry_run_never_calls_mutation_path(self):
        dataset = seeder.generate_demo_dataset(FIXED_DATE)
        inspect_action = AsyncMock(return_value={
            **{name: 0 for name, _ in seeder.TABLE_MODELS},
            "preserved_owner_admin": 1,
        })
        apply_action = AsyncMock()

        exit_code = await seeder.run_with_actions(
            seeder.SeedOptions(as_of=FIXED_DATE),
            inspect_action,
            apply_action,
            dataset,
            lambda _message: None,
        )

        self.assertEqual(exit_code, 0)
        inspect_action.assert_awaited_once_with()
        apply_action.assert_not_awaited()

    async def test_confirmation_is_required_before_any_database_action(self):
        dataset = seeder.generate_demo_dataset(FIXED_DATE)
        inspect_action = AsyncMock()
        apply_action = AsyncMock()

        exit_code = await seeder.run_with_actions(
            seeder.SeedOptions(apply=True, confirmation="WRONG", as_of=FIXED_DATE),
            inspect_action,
            apply_action,
            dataset,
            lambda _message: None,
        )

        self.assertEqual(exit_code, 2)
        inspect_action.assert_not_awaited()
        apply_action.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
