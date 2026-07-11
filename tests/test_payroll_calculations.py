import ast
import unittest
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
UTILS_PATH = REPO_ROOT / "backend" / "app" / "utils.py"
API_PATH = REPO_ROOT / "backend" / "app" / "routers" / "api.py"


def _load_payout_helper():
    source = UTILS_PATH.read_text(encoding="utf-8")
    module = ast.parse(source)
    function = next(
        node
        for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name == "calculate_payout_total"
    )
    namespace = {"Decimal": Decimal, "ROUND_HALF_UP": ROUND_HALF_UP}
    safe_decimal = next(
        node
        for node in module.body
        if isinstance(node, ast.FunctionDef) and node.name == "safe_decimal"
    )
    exec(compile(ast.Module(body=[safe_decimal, function], type_ignores=[]), str(UTILS_PATH), "exec"), namespace)
    return namespace["calculate_payout_total"]


class PayrollCalculationTests(unittest.TestCase):
    def test_employee_and_admin_share_the_same_total(self) -> None:
        calculate_payout_total = _load_payout_helper()
        total = calculate_payout_total(Decimal("1000"), Decimal("100"), Decimal("50"))
        self.assertEqual(total, Decimal("1050.00"))

    def test_personal_deduction_reduces_accrual(self) -> None:
        calculate_payout_total = _load_payout_helper()
        self.assertEqual(
            calculate_payout_total(Decimal("3000"), Decimal("0"), Decimal("400")),
            Decimal("2600.00"),
        )

    def test_operational_expense_is_not_part_of_payroll_total(self) -> None:
        calculate_payout_total = _load_payout_helper()
        expense_amount = Decimal("700")
        payroll_total = calculate_payout_total(Decimal("3000"), Decimal("0"), Decimal("0"))
        self.assertEqual(payroll_total, Decimal("3000.00"))
        self.assertNotEqual(payroll_total, payroll_total - expense_amount)

    def test_monthly_stats_and_team_payroll_use_shared_total(self) -> None:
        source = API_PATH.read_text(encoding="utf-8")
        self.assertGreaterEqual(source.count("calculate_payout_total("), 4)
        self.assertIn("total_payout=total_payout", source)


if __name__ == "__main__":
    unittest.main()
