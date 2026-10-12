import sys
import unittest
from datetime import date
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.services.payroll_schedule import twice_monthly_periods
from app.schemas import PayrollRunCreate, PayrollScheduleUpdate


class PayrollScheduleTests(unittest.TestCase):
    def test_both_requested_schedules(self):
        for first, second in ((20, 5), (25, 10)):
            periods = twice_monthly_periods(2026, 7, first, second)
            self.assertEqual(periods[0], {"period_start": date(2026, 7, 1), "period_end": date(2026, 7, 15),
                                          "planned_payment_date": date(2026, 7, first)})
            self.assertEqual(periods[1], {"period_start": date(2026, 7, 16), "period_end": date(2026, 7, 31),
                                          "planned_payment_date": date(2026, 8, second)})

    def test_month_end_and_leap_year(self):
        for year, end in ((2026, 28), (2028, 29)):
            periods = twice_monthly_periods(year, 2, 31, 5)
            self.assertEqual(periods[0]["planned_payment_date"], date(year, 2, end))
            self.assertEqual(periods[1]["period_end"], date(year, 2, end))
            self.assertEqual(periods[1]["planned_payment_date"], date(year, 3, 5))

    def test_december_rollover(self):
        self.assertEqual(twice_monthly_periods(2026, 12, 25, 10)[1]["planned_payment_date"], date(2027, 1, 10))

    def test_invalid_days_and_months(self):
        for args in ((2026, 13, 20, 5), (2026, 1, 15, 5), (2026, 1, 20, 16), (9999, 12, 20, 5)):
            with self.subTest(args=args), self.assertRaises(ValueError):
                twice_monthly_periods(*args)

    def test_schedule_validation(self):
        for data in ({"schedule_type": "percent_advance"}, {"schedule_type": "twice_monthly"},
                     {"schedule_type": "twice_monthly", "first_payment_day": True, "second_payment_day": 5},
                     {"schedule_type": "manual", "advance_percent": 40}):
            with self.subTest(data=data), self.assertRaises(ValidationError):
                PayrollScheduleUpdate(**data)

    def test_legacy_manual_creation_has_no_due_date(self):
        self.assertIsNone(PayrollRunCreate(period_start=date(2026, 7, 1), period_end=date(2026, 7, 15)).planned_payment_date)

    def test_planned_date_cannot_precede_end(self):
        with self.assertRaises(ValidationError):
            PayrollRunCreate(period_start=date(2026, 7, 1), period_end=date(2026, 7, 15), planned_payment_date=date(2026, 7, 10))
