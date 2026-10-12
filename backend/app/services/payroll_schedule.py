import calendar
from datetime import date


def twice_monthly_periods(year: int, month: int, first_day: int, second_day: int) -> list[dict[str, date]]:
    """Calendar due dates only; no holiday shifts, accrual math or payment operations."""
    if not 1 <= year <= 9998 or not 1 <= month <= 12:
        raise ValueError("Invalid schedule month")
    if not 16 <= first_day <= 31 or not 1 <= second_day <= 15:
        raise ValueError("Invalid payment days")
    last_day = calendar.monthrange(year, month)[1]
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    return [
        {"period_start": date(year, month, 1), "period_end": date(year, month, 15),
         "planned_payment_date": date(year, month, min(first_day, last_day))},
        {"period_start": date(year, month, 16), "period_end": date(year, month, last_day),
         "planned_payment_date": date(next_year, next_month, second_day)},
    ]
