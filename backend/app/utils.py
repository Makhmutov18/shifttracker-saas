from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import enum

from app.models import PayModel


def safe_decimal(value, default: Decimal = Decimal("0.00")) -> Decimal:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return default


def safe_text(value, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def normalize_pay_model(value) -> str:
    if isinstance(value, PayModel):
        return value.value
    if isinstance(value, enum.Enum):
        return str(value.value)
    raw = safe_text(value, "hourly")
    if raw in {"fixed", "shift"}:
        return "fixed_shift"
    if raw in {"hourly", "fixed_shift", "revenue", "hybrid"}:
        return raw
    return "hourly"


def shift_status_label(status) -> str:
    raw = safe_text(status, "pending")
    labels = {
        "pending": "На подтверждении",
        "approved": "Утверждена",
        "rejected": "Отклонена",
    }
    return labels.get(raw, "Действие")


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


def calculate_salary(
    total_hours: Decimal,
    hourly_rate: Decimal,
    revenue: Decimal | None = None,
    revenue_percentage: Decimal | None = None,
    pay_model: str = "hourly",
) -> Decimal:
    """
    Calculate salary based on pay model.
    - hourly: total_hours * hourly_rate
    - fixed_shift: hourly_rate as fixed payout per shift
    - revenue: revenue * revenue_percentage / 100
    - hybrid: (total_hours * hourly_rate) + (revenue * revenue_percentage / 100)
    """
    hourly_part = (total_hours * hourly_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    fixed_shift_part = hourly_rate.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if pay_model == "hourly":
        return hourly_part
    elif pay_model == "fixed_shift":
        return fixed_shift_part
    elif pay_model == "revenue":
        if revenue and revenue_percentage:
            return (revenue * revenue_percentage / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return Decimal("0.00")
    elif pay_model == "hybrid":
        revenue_part = Decimal("0.00")
        if revenue and revenue_percentage:
            revenue_part = (revenue * revenue_percentage / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return hourly_part + revenue_part
    return hourly_part


def get_current_month_range() -> tuple[datetime, datetime]:
    """Returns (start_of_month, end_of_month) in UTC."""
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        end = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        end = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, end
