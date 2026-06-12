from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP


def calculate_hours(start_time, end_time) -> Decimal:
    """
    Calculate hours between two time objects.
    Handles overnight shifts (end_time < start_time).
    """
    start_minutes = start_time.hour * 60 + start_time.minute
    end_minutes = end_time.hour * 60 + end_time.minute

    if end_minutes < start_minutes:
        # Shift crosses midnight
        end_minutes += 24 * 60

    total_minutes = end_minutes - start_minutes
    hours = Decimal(str(total_minutes)) / Decimal("60")
    return hours.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_salary(total_hours: Decimal, hourly_rate: Decimal) -> Decimal:
    return (total_hours * hourly_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_current_month_range() -> tuple[datetime, datetime]:
    """Returns (start_of_month, end_of_month) in UTC."""
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        end = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        end = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, end