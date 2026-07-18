"""Create a deterministic two-venue demo company in a test database.

The module is intentionally not imported by application startup. Without both
--apply and the exact confirmation phrase it performs read-only inspection.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Awaitable, Callable, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models import (
    Adjustment,
    AdjustmentType,
    AuditLog,
    Expense,
    PayModel,
    PayrollPayment,
    PayrollRun,
    PayrollRunAdjustmentSource,
    PayrollRunItem,
    PayrollRunShiftSource,
    PayrollRunStatus,
    PayrollScheduleSettings,
    Shift,
    User,
    UserRole,
    Venue,
    WebSession,
)
from app.utils import calculate_hours, calculate_payout_total, calculate_salary, safe_decimal


RANDOM_SEED = 20260718
CONFIRMATION_PHRASE = "RESET_TEST_DATABASE"
DEMO_NAMESPACE = uuid.UUID("19a38ab6-c416-5ec0-94c0-b426cffb7528")
PRIMARY_VENUE_NAME = "Кофейня на Баумана"
SECONDARY_VENUE_NAME = "Кофейня на Кремлёвской"
MONEY_QUANTUM = Decimal("0.01")


class DemoSeedError(RuntimeError):
    """Safe validation error suitable for CLI output."""


def deterministic_uuid(label: str) -> uuid.UUID:
    return uuid.uuid5(DEMO_NAMESPACE, label)


def money(value: Decimal | int | str) -> Decimal:
    return safe_decimal(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class DemoVenue:
    id: uuid.UUID
    name: str


@dataclass(frozen=True)
class DemoEmployee:
    id: uuid.UUID
    name: str
    position: str
    role: str
    venue_id: uuid.UUID
    hourly_rate: Decimal
    revenue_percentage: Decimal
    pay_model: str
    telegram_id: None = None


@dataclass
class DemoShift:
    id: uuid.UUID
    user_id: uuid.UUID
    venue_id: uuid.UUID
    work_date: date
    start_time: time
    end_time: time
    total_hours: Decimal
    salary_earned: Decimal
    revenue: Decimal | None
    status: str = "approved"


@dataclass(frozen=True)
class DemoAdjustment:
    id: uuid.UUID
    user_id: uuid.UUID
    venue_id: uuid.UUID
    type: str
    amount: Decimal
    reason: str
    month: int
    year: int
    created_at: datetime


@dataclass(frozen=True)
class DemoExpense:
    id: uuid.UUID
    user_id: uuid.UUID
    venue_id: uuid.UUID
    amount: Decimal
    category: str
    comment: str
    expense_date: date


@dataclass(frozen=True)
class DemoPayrollItem:
    id: uuid.UUID
    user_id: uuid.UUID
    approved_shifts_count: int
    approved_hours: Decimal
    base_amount: Decimal
    bonus_amount: Decimal
    deduction_amount: Decimal
    final_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal


@dataclass(frozen=True)
class DemoPayrollPayment:
    id: uuid.UUID
    user_id: uuid.UUID
    amount: Decimal
    payment_date: date
    method: str
    comment: str


@dataclass(frozen=True)
class DemoPayrollRun:
    id: uuid.UUID
    title: str
    period_start: date
    period_end: date
    status: str
    venue_id: uuid.UUID
    total_amount: Decimal
    total_paid: Decimal
    revenue_total: Decimal | None
    items: tuple[DemoPayrollItem, ...]
    shift_ids: tuple[uuid.UUID, ...]
    adjustment_ids: tuple[uuid.UUID, ...]
    payments: tuple[DemoPayrollPayment, ...]


@dataclass(frozen=True)
class DemoDataset:
    start_date: date
    end_date: date
    current_week_start: date
    venues: tuple[DemoVenue, ...]
    employees: tuple[DemoEmployee, ...]
    shifts: tuple[DemoShift, ...]
    adjustments: tuple[DemoAdjustment, ...]
    expenses: tuple[DemoExpense, ...]
    payroll_runs: tuple[DemoPayrollRun, ...]


@dataclass(frozen=True)
class SeedOptions:
    apply: bool = False
    confirmation: str | None = None
    as_of: date = field(default_factory=date.today)


EMPLOYEE_BLUEPRINTS = (
    ("Анна Соколова", "Старший бариста", "senior", 0, "hybrid", "360.00", "0.60"),
    ("Максим Волков", "Бариста", "barista", 0, "hourly", "280.00", "0.00"),
    ("Дарья Орлова", "Бариста", "barista", 0, "hourly", "300.00", "0.00"),
    ("Илья Морозов", "Бариста", "barista", 0, "hourly", "260.00", "0.00"),
    ("Полина Лебедева", "Бариста", "barista", 0, "hourly", "320.00", "0.00"),
    ("Артём Новиков", "Повар", "cook", 0, "fixed_shift", "3200.00", "0.00"),
    ("Мария Кузнецова", "Старший бариста", "senior", 1, "hybrid", "350.00", "0.50"),
    ("Никита Павлов", "Бариста", "barista", 1, "hourly", "270.00", "0.00"),
    ("Елена Васильева", "Бариста", "barista", 1, "hourly", "290.00", "0.00"),
    ("Кирилл Фёдоров", "Бариста", "barista", 1, "hourly", "310.00", "0.00"),
    ("Софья Михайлова", "Бариста", "barista", 1, "hourly", "250.00", "0.00"),
    ("Роман Алексеев", "Повар", "cook", 1, "fixed_shift", "3400.00", "0.00"),
)


def _rotating_selection(pool: Sequence[DemoEmployee], count: int, offset: int) -> list[DemoEmployee]:
    if count > len(pool):
        raise DemoSeedError("Недостаточно сотрудников для расписания без дублей")
    return [pool[(offset + index) % len(pool)] for index in range(count)]


def _shift_times(employee: DemoEmployee, sequence: int) -> tuple[time, time]:
    if employee.role == "cook":
        return time(8, 0), time(18, 0)
    if sequence % 17 == 0:
        return time(8, 0), time(20, 0)
    if sequence % 2 == 0:
        return time(7, 30), time(14, 30)
    return time(14, 30), time(21, 30)


def _make_employees(venues: tuple[DemoVenue, DemoVenue]) -> tuple[DemoEmployee, ...]:
    employees = []
    for name, position, role, venue_index, pay_model, rate, percentage in EMPLOYEE_BLUEPRINTS:
        employees.append(
            DemoEmployee(
                id=deterministic_uuid(f"employee:{name}"),
                name=name,
                position=position,
                role=role,
                venue_id=venues[venue_index].id,
                hourly_rate=money(rate),
                revenue_percentage=money(percentage),
                pay_model=pay_model,
            )
        )
    return tuple(employees)


def _make_shifts(
    employees: tuple[DemoEmployee, ...],
    venues: tuple[DemoVenue, DemoVenue],
    start_date: date,
    end_date: date,
    current_week_start: date,
    rng: random.Random,
) -> tuple[DemoShift, ...]:
    weekday_load = {0: 6, 1: 6, 2: 7, 3: 7, 4: 8, 5: 9, 6: 9}
    first_home = tuple(employee for employee in employees if employee.venue_id == venues[0].id)
    second_home_all = tuple(employee for employee in employees if employee.venue_id == venues[1].id)
    # One employee is intentionally off in the current week: 11 unique workers is realistic.
    second_home_current = tuple(employee for employee in second_home_all if employee.name != "Софья Михайлова")
    shifts: list[DemoShift] = []

    current = start_date
    day_index = 0
    sequence = 0
    while current <= end_date:
        daily_count = weekday_load[current.weekday()]
        is_current_week = current >= current_week_start
        if is_current_week:
            first_count = (daily_count + 1) // 2
            if current.weekday() in {1, 4}:
                first_count += 1
        else:
            first_count = daily_count // 2 + day_index % 2
        second_count = daily_count - first_count
        second_pool = second_home_current if is_current_week else second_home_all
        selected = [
            *_rotating_selection(first_home, first_count, day_index * 2),
            *_rotating_selection(second_pool, second_count, day_index * 3),
        ]
        for employee in selected:
            start_time, end_time = _shift_times(employee, sequence)
            total_hours = calculate_hours(start_time, end_time)
            revenue = None
            if employee.pay_model in {"revenue", "hybrid"}:
                revenue = money(rng.randrange(25_000, 55_001, 500))
            salary = calculate_salary(
                total_hours,
                employee.hourly_rate,
                revenue,
                employee.revenue_percentage,
                employee.pay_model,
            )
            shifts.append(
                DemoShift(
                    id=deterministic_uuid(f"shift:{current.isoformat()}:{employee.id}"),
                    user_id=employee.id,
                    venue_id=employee.venue_id,
                    work_date=current,
                    start_time=start_time,
                    end_time=end_time,
                    total_hours=total_hours,
                    salary_earned=money(salary),
                    revenue=revenue,
                )
            )
            sequence += 1
        current += timedelta(days=1)
        day_index += 1

    employee_by_name = {employee.name: employee for employee in employees}
    cross_roster = [
        employee_by_name["Максим Волков"],
        employee_by_name["Никита Павлов"],
        employee_by_name["Дарья Орлова"],
        employee_by_name["Елена Васильева"],
    ]
    current_shifts = sorted(
        (shift for shift in shifts if shift.work_date >= current_week_start),
        key=lambda shift: (shift.work_date, shift.id.hex),
    )
    desired_cross_count = min(6, max(1, len(current_shifts) // 7))
    cross_candidates = {
        employee.id: [shift for shift in current_shifts if shift.user_id == employee.id]
        for employee in cross_roster
    }
    candidate_offsets = defaultdict(int)
    cross_shift_ids: set[uuid.UUID] = set()
    while len(cross_shift_ids) < desired_cross_count:
        progressed = False
        for employee in cross_roster:
            candidates = cross_candidates[employee.id]
            offset = candidate_offsets[employee.id]
            if offset >= len(candidates):
                continue
            shift = candidates[offset]
            candidate_offsets[employee.id] += 1
            shift.venue_id = venues[1].id if employee.venue_id == venues[0].id else venues[0].id
            cross_shift_ids.add(shift.id)
            progressed = True
            if len(cross_shift_ids) == desired_cross_count:
                break
        if not progressed:
            raise DemoSeedError("Не удалось сформировать cross-venue смены")

    rejected_current = next(
        (
            shift for shift in current_shifts
            if shift.id not in cross_shift_ids and shift.venue_id == venues[0].id
        ),
        None,
    )
    if rejected_current is None:
        raise DemoSeedError("Не удалось выбрать отклонённую смену текущей недели")
    rejected_current.status = "rejected"
    pending_count = min(5, max(1, len(current_shifts) // 8))
    pending_current = [
        shift for shift in reversed(current_shifts)
        if shift.id != rejected_current.id
    ][:pending_count]
    for shift in pending_current:
        shift.status = "pending"

    past_shifts = [shift for shift in shifts if shift.work_date < current_week_start]
    total_target_pending = max(pending_count, round(len(shifts) * 0.06))
    total_target_rejected = max(1, round(len(shifts) * 0.03))
    past_pending_count = min(len(past_shifts), total_target_pending - pending_count)
    remaining_past = rng.sample(past_shifts, len(past_shifts))
    for shift in remaining_past[:past_pending_count]:
        shift.status = "pending"
    past_rejected_count = min(
        len(remaining_past) - past_pending_count,
        total_target_rejected - 1,
    )
    for shift in remaining_past[past_pending_count:past_pending_count + past_rejected_count]:
        shift.status = "rejected"

    return tuple(sorted(shifts, key=lambda shift: (shift.work_date, shift.user_id.hex)))


def _make_adjustments(
    employees: tuple[DemoEmployee, ...],
    as_of: date,
    rng: random.Random,
) -> tuple[DemoAdjustment, ...]:
    definitions = (
        ("bonus", "Подмена коллеги", 500, 3000),
        ("bonus", "Помощь команде в выходной", 500, 3000),
        ("bonus", "Качественная работа в час пик", 500, 3000),
        ("bonus", "Дополнительная ответственность", 500, 3000),
        ("bonus", "Премия за смену", 500, 3000),
        ("penalty", "Аванс", 300, 1500),
        ("penalty", "Покупка зерна в счёт зарплаты", 300, 1500),
        ("penalty", "Корректировка начисления", 300, 1500),
    )
    adjustments = []
    employee_indexes = (0, 2, 4, 6, 8, 1, 7, 9)
    for index, ((adjustment_type, reason, minimum, maximum), employee_index) in enumerate(
        zip(definitions, employee_indexes)
    ):
        employee = employees[employee_index]
        amount = money(rng.randrange(minimum, maximum + 1, 100))
        created_date = as_of - timedelta(days=min(index, as_of.day - 1))
        adjustments.append(
            DemoAdjustment(
                id=deterministic_uuid(f"adjustment:{as_of:%Y-%m}:{index}"),
                user_id=employee.id,
                venue_id=employee.venue_id,
                type=adjustment_type,
                amount=amount,
                reason=reason,
                month=as_of.month,
                year=as_of.year,
                created_at=datetime.combine(created_date, time(12, 0), tzinfo=timezone.utc),
            )
        )
    return tuple(adjustments)


def _make_expenses(
    employees: tuple[DemoEmployee, ...],
    start_date: date,
    as_of: date,
    rng: random.Random,
) -> tuple[DemoExpense, ...]:
    categories = ("Хозтовары", "Доставка", "Мелкий ремонт", "Расходные материалы")
    comments = ("Чек сохранён", "Покупка для точки", "Рабочие материалы", "Текущие нужды")
    expenses = []
    period_days = (as_of - start_date).days + 1
    for index in range(14):
        employee = employees[(index * 5) % len(employees)]
        expense_date = start_date + timedelta(days=(index * 7) % period_days)
        expenses.append(
            DemoExpense(
                id=deterministic_uuid(f"expense:{as_of.isoformat()}:{index}"),
                user_id=employee.id,
                venue_id=employee.venue_id,
                amount=money(rng.randrange(300, 2501, 100)),
                category=categories[index % len(categories)],
                comment=comments[index % len(comments)],
                expense_date=expense_date,
            )
        )
    return tuple(expenses)


def _make_payroll_run(
    *,
    label: str,
    title: str,
    venue: DemoVenue,
    period_start: date,
    period_end: date,
    status: str,
    shifts: Sequence[DemoShift],
    adjustments: Sequence[DemoAdjustment],
    payment_ratio: Decimal,
    revenue_total: Decimal | None,
    as_of: date,
    source_period_start: date | None = None,
    source_period_end: date | None = None,
) -> DemoPayrollRun:
    run_id = deterministic_uuid(f"payroll-run:{label}:{venue.id}")
    shift_period_start = source_period_start or period_start
    shift_period_end = source_period_end or period_end
    source_shifts = [
        shift for shift in shifts
        if shift.venue_id == venue.id
        and shift.status == "approved"
        and shift_period_start <= shift.work_date <= shift_period_end
    ]
    source_adjustments = [adjustment for adjustment in adjustments if adjustment.venue_id == venue.id]
    rows: dict[uuid.UUID, dict[str, Decimal | int]] = defaultdict(
        lambda: {
            "count": 0,
            "hours": Decimal("0.00"),
            "base": Decimal("0.00"),
            "bonus": Decimal("0.00"),
            "deduction": Decimal("0.00"),
        }
    )
    for shift in source_shifts:
        row = rows[shift.user_id]
        row["count"] = int(row["count"]) + 1
        row["hours"] = safe_decimal(row["hours"]) + shift.total_hours
        row["base"] = safe_decimal(row["base"]) + shift.salary_earned
    for adjustment in source_adjustments:
        row = rows[adjustment.user_id]
        key = "bonus" if adjustment.type == "bonus" else "deduction"
        row[key] = safe_decimal(row[key]) + adjustment.amount

    items = []
    payments = []
    for user_id, row in sorted(rows.items(), key=lambda pair: pair[0].hex):
        final_amount = calculate_payout_total(
            safe_decimal(row["base"]),
            safe_decimal(row["bonus"]),
            safe_decimal(row["deduction"]),
        )
        paid_amount = money(final_amount * payment_ratio)
        remaining_amount = money(final_amount - paid_amount)
        item = DemoPayrollItem(
            id=deterministic_uuid(f"payroll-item:{run_id}:{user_id}"),
            user_id=user_id,
            approved_shifts_count=int(row["count"]),
            approved_hours=money(safe_decimal(row["hours"])),
            base_amount=money(safe_decimal(row["base"])),
            bonus_amount=money(safe_decimal(row["bonus"])),
            deduction_amount=money(safe_decimal(row["deduction"])),
            final_amount=money(final_amount),
            paid_amount=paid_amount,
            remaining_amount=remaining_amount,
        )
        items.append(item)
        if paid_amount > 0:
            payments.append(
                DemoPayrollPayment(
                    id=deterministic_uuid(f"payroll-payment:{run_id}:{user_id}"),
                    user_id=user_id,
                    amount=paid_amount,
                    payment_date=min(as_of, period_end + timedelta(days=2)),
                    method="Вручную",
                    comment="Демо-выплата",
                )
            )

    return DemoPayrollRun(
        id=run_id,
        title=title,
        period_start=period_start,
        period_end=period_end,
        status=status,
        venue_id=venue.id,
        total_amount=money(sum((item.final_amount for item in items), Decimal("0.00"))),
        total_paid=money(sum((item.paid_amount for item in items), Decimal("0.00"))),
        revenue_total=money(revenue_total) if revenue_total is not None else None,
        items=tuple(items),
        shift_ids=tuple(shift.id for shift in source_shifts),
        adjustment_ids=tuple(adjustment.id for adjustment in source_adjustments),
        payments=tuple(payments),
    )


def _make_payroll_runs(
    venues: tuple[DemoVenue, DemoVenue],
    shifts: tuple[DemoShift, ...],
    adjustments: tuple[DemoAdjustment, ...],
    start_date: date,
    as_of: date,
    current_week_start: date,
) -> tuple[DemoPayrollRun, ...]:
    previous_end = current_week_start - timedelta(days=1)
    previous_start = max(start_date, previous_end - timedelta(days=13))
    current_days = (as_of - current_week_start).days + 1
    previous_days = (previous_end - previous_start).days + 1
    return (
        _make_payroll_run(
            label="previous-paid",
            title="Предыдущий период — Баумана",
            venue=venues[0],
            period_start=previous_start,
            period_end=previous_end,
            status="paid",
            shifts=shifts,
            adjustments=(),
            payment_ratio=Decimal("1.00"),
            revenue_total=Decimal("82000.00") * previous_days,
            as_of=as_of,
        ),
        _make_payroll_run(
            label="previous-partial",
            title="Предыдущий период — Кремлёвская",
            venue=venues[1],
            period_start=previous_start,
            period_end=current_week_start,
            status="finalized",
            shifts=shifts,
            adjustments=(),
            payment_ratio=Decimal("0.50"),
            revenue_total=Decimal("67000.00") * previous_days,
            as_of=as_of,
            source_period_end=previous_end,
        ),
        _make_payroll_run(
            label="current-draft",
            title="Текущая неделя — Баумана",
            venue=venues[0],
            period_start=current_week_start,
            period_end=as_of,
            status="draft",
            shifts=shifts,
            adjustments=adjustments,
            payment_ratio=Decimal("0.00"),
            revenue_total=Decimal("90000.00") * current_days,
            as_of=as_of,
        ),
        _make_payroll_run(
            label="current-draft",
            title="Текущая неделя — Кремлёвская",
            venue=venues[1],
            period_start=current_week_start,
            period_end=as_of,
            status="draft",
            shifts=shifts,
            adjustments=adjustments,
            payment_ratio=Decimal("0.00"),
            revenue_total=None,
            as_of=as_of,
        ),
    )


def generate_demo_dataset(as_of: date | None = None) -> DemoDataset:
    end_date = as_of or date.today()
    start_date = end_date - timedelta(days=29)
    current_week_start = end_date - timedelta(days=end_date.weekday())
    rng = random.Random(RANDOM_SEED)
    venues = (
        DemoVenue(deterministic_uuid(f"venue:{PRIMARY_VENUE_NAME}"), PRIMARY_VENUE_NAME),
        DemoVenue(deterministic_uuid(f"venue:{SECONDARY_VENUE_NAME}"), SECONDARY_VENUE_NAME),
    )
    employees = _make_employees(venues)
    shifts = _make_shifts(employees, venues, start_date, end_date, current_week_start, rng)
    adjustments = _make_adjustments(employees, end_date, rng)
    expenses = _make_expenses(employees, start_date, end_date, rng)
    payroll_runs = _make_payroll_runs(
        venues,
        shifts,
        adjustments,
        start_date,
        end_date,
        current_week_start,
    )
    dataset = DemoDataset(
        start_date=start_date,
        end_date=end_date,
        current_week_start=current_week_start,
        venues=venues,
        employees=employees,
        shifts=shifts,
        adjustments=adjustments,
        expenses=expenses,
        payroll_runs=payroll_runs,
    )
    validate_demo_dataset(dataset)
    return dataset


def calculate_dataset_metrics(dataset: DemoDataset, period_start: date, period_end: date) -> dict[str, Decimal | int]:
    period_shifts = [
        shift for shift in dataset.shifts
        if period_start <= shift.work_date <= period_end
    ]
    worked = [shift for shift in period_shifts if shift.status in {"approved", "pending"}]
    employees = {employee.id: employee for employee in dataset.employees}
    overlapping_runs = [
        run for run in dataset.payroll_runs
        if run.period_start <= period_end and run.period_end >= period_start
    ]
    return {
        "approved": sum(shift.status == "approved" for shift in period_shifts),
        "pending": sum(shift.status == "pending" for shift in period_shifts),
        "rejected": sum(shift.status == "rejected" for shift in period_shifts),
        "hours": money(sum((shift.total_hours for shift in period_shifts if shift.status == "approved"), Decimal("0.00"))),
        "accruals": money(sum((shift.salary_earned for shift in period_shifts if shift.status == "approved"), Decimal("0.00"))),
        "unique_employees": len({shift.user_id for shift in worked}),
        "cross_venue_shifts": sum(
            shift.venue_id != employees[shift.user_id].venue_id
            for shift in worked
        ),
        "draft_payroll_runs": sum(run.status == "draft" for run in overlapping_runs),
        "finalized_unpaid_runs": sum(
            run.status == "finalized" and run.total_paid < run.total_amount
            for run in overlapping_runs
        ),
    }


def validate_demo_dataset(dataset: DemoDataset) -> None:
    errors: list[str] = []
    venue_ids = {venue.id for venue in dataset.venues}
    employee_ids = {employee.id for employee in dataset.employees}
    if len(dataset.venues) != 2:
        errors.append("должно быть ровно две demo-точки")
    if len(dataset.employees) != 12:
        errors.append("должно быть ровно 12 demo-сотрудников")
    if any(employee.telegram_id is not None for employee in dataset.employees):
        errors.append("demo-сотрудники не должны иметь Telegram ID")
    if any(employee.venue_id not in venue_ids for employee in dataset.employees):
        errors.append("у сотрудника указана неизвестная основная точка")
    if any(shift.work_date > dataset.end_date for shift in dataset.shifts):
        errors.append("обнаружена смена в будущем")
    if any(shift.user_id not in employee_ids or shift.venue_id not in venue_ids for shift in dataset.shifts):
        errors.append("смена ссылается на неизвестного сотрудника или точку")
    shift_keys = [(shift.user_id, shift.work_date) for shift in dataset.shifts]
    if len(shift_keys) != len(set(shift_keys)):
        errors.append("у сотрудника больше одной смены в день")
    if any(shift.salary_earned < 0 for shift in dataset.shifts):
        errors.append("обнаружено отрицательное начисление смены")

    status_counts = Counter(shift.status for shift in dataset.shifts)
    if any(status_counts[status] <= 0 for status in ("approved", "pending", "rejected")):
        errors.append("каждый статус смен должен присутствовать")
    current_metrics = calculate_dataset_metrics(dataset, dataset.current_week_start, dataset.end_date)
    if any(int(current_metrics[status]) <= 0 for status in ("approved", "pending", "rejected")):
        errors.append("текущая неделя должна содержать все статусы")
    if int(current_metrics["cross_venue_shifts"]) <= 0:
        errors.append("текущая неделя должна содержать cross-venue смены")
    current_venue_ids = {
        shift.venue_id for shift in dataset.shifts
        if shift.work_date >= dataset.current_week_start and shift.status in {"approved", "pending"}
    }
    if current_venue_ids != venue_ids:
        errors.append("текущая неделя должна охватывать обе точки")

    shift_by_id = {shift.id: shift for shift in dataset.shifts}
    adjustment_by_id = {adjustment.id: adjustment for adjustment in dataset.adjustments}
    active_shift_sources: set[uuid.UUID] = set()
    active_adjustment_sources: set[uuid.UUID] = set()
    for run in dataset.payroll_runs:
        if run.status in {"draft", "finalized", "paid"}:
            for shift_id in run.shift_ids:
                if shift_id in active_shift_sources:
                    errors.append("смена входит в несколько активных расчётов")
                active_shift_sources.add(shift_id)
            for adjustment_id in run.adjustment_ids:
                if adjustment_id in active_adjustment_sources:
                    errors.append("корректировка входит в несколько активных расчётов")
                active_adjustment_sources.add(adjustment_id)

        item_by_user = {item.user_id: item for item in run.items}
        expected: dict[uuid.UUID, dict[str, Decimal | int]] = defaultdict(
            lambda: {"count": 0, "hours": Decimal("0"), "base": Decimal("0"), "bonus": Decimal("0"), "deduction": Decimal("0")}
        )
        for shift_id in run.shift_ids:
            shift = shift_by_id.get(shift_id)
            if shift is None or shift.status != "approved":
                errors.append("payroll source должен ссылаться на approved смену")
                continue
            row = expected[shift.user_id]
            row["count"] = int(row["count"]) + 1
            row["hours"] = safe_decimal(row["hours"]) + shift.total_hours
            row["base"] = safe_decimal(row["base"]) + shift.salary_earned
        for adjustment_id in run.adjustment_ids:
            adjustment = adjustment_by_id.get(adjustment_id)
            if adjustment is None:
                errors.append("payroll source ссылается на неизвестную корректировку")
                continue
            row = expected[adjustment.user_id]
            key = "bonus" if adjustment.type == "bonus" else "deduction"
            row[key] = safe_decimal(row[key]) + adjustment.amount
        for user_id, row in expected.items():
            item = item_by_user.get(user_id)
            final_amount = calculate_payout_total(
                safe_decimal(row["base"]), safe_decimal(row["bonus"]), safe_decimal(row["deduction"])
            )
            if item is None or (
                item.approved_shifts_count != int(row["count"])
                or item.approved_hours != money(safe_decimal(row["hours"]))
                or item.base_amount != money(safe_decimal(row["base"]))
                or item.bonus_amount != money(safe_decimal(row["bonus"]))
                or item.deduction_amount != money(safe_decimal(row["deduction"]))
                or item.final_amount != money(final_amount)
            ):
                errors.append("строка расчёта не совпадает с сохранёнными источниками")
        if set(item_by_user) != set(expected):
            errors.append("набор сотрудников расчёта не совпадает с источниками")
        if run.total_amount != money(sum((item.final_amount for item in run.items), Decimal("0"))):
            errors.append("итог расчёта не совпадает со строками")
        if run.total_paid != money(sum((item.paid_amount for item in run.items), Decimal("0"))):
            errors.append("выплаченная сумма расчёта не совпадает со строками")
        if run.total_paid > run.total_amount:
            errors.append("выплачено больше начисленного")
        if any(item.paid_amount > item.final_amount or item.remaining_amount < 0 for item in run.items):
            errors.append("некорректный остаток строки расчёта")
        payment_by_user = defaultdict(Decimal)
        for payment in run.payments:
            payment_by_user[payment.user_id] += payment.amount
        if any(payment_by_user[item.user_id] != item.paid_amount for item in run.items):
            errors.append("платежи не совпадают с paid_amount строки")

    if errors:
        raise DemoSeedError("Проверка demo-набора не пройдена: " + "; ".join(dict.fromkeys(errors)))


def should_preserve_user(role: UserRole | str) -> bool:
    value = role.value if hasattr(role, "value") else str(role)
    return value in {UserRole.owner.value, UserRole.admin.value}


TABLE_MODELS = (
    ("payroll_payments", PayrollPayment),
    ("payroll_run_shift_sources", PayrollRunShiftSource),
    ("payroll_run_adjustment_sources", PayrollRunAdjustmentSource),
    ("payroll_run_items", PayrollRunItem),
    ("payroll_runs", PayrollRun),
    ("adjustments", Adjustment),
    ("expenses", Expense),
    ("audit_logs", AuditLog),
    ("shifts", Shift),
    ("payroll_schedule_settings", PayrollScheduleSettings),
    ("users", User),
    ("venues", Venue),
)


async def inspect_database(session: AsyncSession) -> dict[str, int]:
    counts: dict[str, int] = {}
    for name, model in TABLE_MODELS:
        result = await session.execute(select(func.count()).select_from(model))
        counts[name] = int(result.scalar_one())
    preserved_result = await session.execute(
        select(func.count()).select_from(User).where(User.role.in_((UserRole.owner, UserRole.admin)))
    )
    counts["preserved_owner_admin"] = int(preserved_result.scalar_one())
    return counts


async def _delete_existing_data(session: AsyncSession, preserved_user_ids: Sequence[uuid.UUID]) -> None:
    for model in (
        PayrollPayment,
        PayrollRunShiftSource,
        PayrollRunAdjustmentSource,
        PayrollRunItem,
        PayrollRun,
        Adjustment,
        Expense,
        AuditLog,
        PayrollScheduleSettings,
        Shift,
    ):
        await session.execute(delete(model))
    await session.execute(
        delete(WebSession).where(WebSession.user_id.notin_(preserved_user_ids))
    )
    await session.execute(
        delete(User)
        .where(User.id.notin_(preserved_user_ids))
        .execution_options(synchronize_session=False)
    )


async def apply_demo_dataset(session: AsyncSession, dataset: DemoDataset) -> dict[str, int | str]:
    preserved_result = await session.execute(
        select(User).where(User.role.in_((UserRole.owner, UserRole.admin))).order_by(User.name, User.id)
    )
    preserved_users = list(preserved_result.scalars().all())
    if not preserved_users:
        raise DemoSeedError("Не найден owner/admin: reset отменён, чтобы не потерять доступ")
    preserved_ids = [user.id for user in preserved_users]
    creator = next((user for user in preserved_users if user.role == UserRole.owner), preserved_users[0])

    await _delete_existing_data(session, preserved_ids)
    for venue_data in dataset.venues:
        venue = await session.get(Venue, venue_data.id)
        if venue is None:
            session.add(Venue(id=venue_data.id, name=venue_data.name, is_active=True))
        else:
            venue.name = venue_data.name
            venue.is_active = True
    await session.flush()
    for user in preserved_users:
        user.venue_id = dataset.venues[0].id
    await session.flush()
    await session.execute(
        delete(Venue).where(Venue.id.notin_([venue.id for venue in dataset.venues]))
    )

    session.add_all([
        User(
            id=employee.id,
            telegram_id=None,
            telegram_photo_url=None,
            name=employee.name,
            position=employee.position,
            role=UserRole(employee.role),
            venue_id=employee.venue_id,
            hourly_rate=employee.hourly_rate,
            revenue_percentage=employee.revenue_percentage,
            permissions={},
            pay_model=PayModel(employee.pay_model),
            is_active=True,
            invite_token=None,
        )
        for employee in dataset.employees
    ])
    session.add_all([
        Shift(
            id=shift.id,
            user_id=shift.user_id,
            venue_id=shift.venue_id,
            date=shift.work_date,
            start_time=shift.start_time,
            end_time=shift.end_time,
            cashier_hours=Decimal("0.00"),
            total_hours=shift.total_hours,
            salary_earned=shift.salary_earned,
            revenue=shift.revenue,
            status=shift.status,
            comment=None,
            created_at=datetime.combine(shift.work_date, shift.end_time, tzinfo=timezone.utc),
        )
        for shift in dataset.shifts
    ])
    session.add_all([
        Adjustment(
            id=adjustment.id,
            user_id=adjustment.user_id,
            venue_id=adjustment.venue_id,
            type=AdjustmentType(adjustment.type),
            amount=adjustment.amount,
            reason=adjustment.reason,
            created_by=creator.id,
            month=adjustment.month,
            year=adjustment.year,
            created_at=adjustment.created_at,
        )
        for adjustment in dataset.adjustments
    ])
    session.add_all([
        Expense(
            id=expense.id,
            user_id=expense.user_id,
            venue_id=expense.venue_id,
            amount=expense.amount,
            category=expense.category,
            comment=expense.comment,
            date=expense.expense_date,
            created_at=datetime.combine(expense.expense_date, time(12, 0), tzinfo=timezone.utc),
        )
        for expense in dataset.expenses
    ])

    for run in dataset.payroll_runs:
        created_at = datetime.combine(run.period_end, time(20, 0), tzinfo=timezone.utc)
        session.add(
            PayrollRun(
                id=run.id,
                title=run.title,
                period_start=run.period_start,
                period_end=run.period_end,
                status=PayrollRunStatus(run.status),
                total_amount=run.total_amount,
                total_paid=run.total_paid,
                revenue_total=run.revenue_total,
                created_by_id=creator.id,
                venue_id=run.venue_id,
                created_at=created_at,
                finalized_at=created_at if run.status in {"finalized", "paid"} else None,
                paid_at=created_at if run.status == "paid" else None,
                notes="Детерминированный demo-расчёт",
            )
        )
        session.add_all([
            PayrollRunItem(
                id=item.id,
                payroll_run_id=run.id,
                user_id=item.user_id,
                approved_shifts_count=item.approved_shifts_count,
                approved_hours=item.approved_hours,
                base_amount=item.base_amount,
                bonus_amount=item.bonus_amount,
                deduction_amount=item.deduction_amount,
                final_amount=item.final_amount,
                paid_amount=item.paid_amount,
                remaining_amount=item.remaining_amount,
                created_at=created_at,
            )
            for item in run.items
        ])
        session.add_all([
            PayrollRunShiftSource(
                id=deterministic_uuid(f"payroll-shift-source:{run.id}:{shift_id}"),
                payroll_run_id=run.id,
                shift_id=shift_id,
                created_at=created_at,
            )
            for shift_id in run.shift_ids
        ])
        session.add_all([
            PayrollRunAdjustmentSource(
                id=deterministic_uuid(f"payroll-adjustment-source:{run.id}:{adjustment_id}"),
                payroll_run_id=run.id,
                adjustment_id=adjustment_id,
                created_at=created_at,
            )
            for adjustment_id in run.adjustment_ids
        ])
        session.add_all([
            PayrollPayment(
                id=payment.id,
                payroll_run_id=run.id,
                user_id=payment.user_id,
                amount=payment.amount,
                payment_date=payment.payment_date,
                method=payment.method,
                comment=payment.comment,
                created_by_id=creator.id,
                created_at=created_at,
            )
            for payment in run.payments
        ])

    await session.flush()
    venue_count = await session.scalar(select(func.count()).select_from(Venue))
    active_demo_venue_count = await session.scalar(
        select(func.count()).select_from(Venue).where(
            Venue.id.in_([venue.id for venue in dataset.venues]),
            Venue.is_active == True,
        )
    )
    employee_count = await session.scalar(
        select(func.count()).select_from(User).where(User.id.in_([employee.id for employee in dataset.employees]))
    )
    owner_admin_count = await session.scalar(
        select(func.count()).select_from(User).where(User.role.in_((UserRole.owner, UserRole.admin)))
    )
    preserved_primary_count = await session.scalar(
        select(func.count()).select_from(User).where(
            User.id.in_(preserved_ids),
            User.venue_id == dataset.venues[0].id,
        )
    )
    if (
        venue_count != 2
        or active_demo_venue_count != 2
        or employee_count != 12
        or owner_admin_count != len(preserved_users)
        or preserved_primary_count != len(preserved_users)
    ):
        raise DemoSeedError("Проверка записанных demo-данных не пройдена")

    status_counts = Counter(shift.status for shift in dataset.shifts)
    metrics = calculate_dataset_metrics(dataset, dataset.current_week_start, dataset.end_date)
    return {
        "preserved_owner_admin": len(preserved_users),
        "venues": len(dataset.venues),
        "employees": len(dataset.employees),
        "shifts": len(dataset.shifts),
        "approved": status_counts["approved"],
        "pending": status_counts["pending"],
        "rejected": status_counts["rejected"],
        "cross_venue_shifts": int(calculate_dataset_metrics(dataset, dataset.start_date, dataset.end_date)["cross_venue_shifts"]),
        "adjustments": len(dataset.adjustments),
        "payroll_runs": len(dataset.payroll_runs),
        "payroll_payments": sum(len(run.payments) for run in dataset.payroll_runs),
        "date_range": f"{dataset.start_date.isoformat()} — {dataset.end_date.isoformat()}",
        **{f"week_{key}": value for key, value in metrics.items()},
    }


def build_apply_command(as_of: date | None = None) -> str:
    command = "python -m app.scripts.seed_demo_company --apply --confirm RESET_TEST_DATABASE"
    if as_of is not None:
        command += f" --as-of {as_of.isoformat()}"
    return command


def print_dry_run(counts: dict[str, int], dataset: DemoDataset, output: Callable[[str], None] = print) -> None:
    output("DRY-RUN: база открыта только для чтения, изменения не выполняются.")
    output("Текущие записи:")
    for name, _ in TABLE_MODELS:
        output(f"  {name}: {counts.get(name, 0)}")
    preserved = counts.get("preserved_owner_admin", 0)
    output(f"Будет сохранено owner/admin: {preserved}")
    output(f"Будет удалено non-owner/admin пользователей: {max(counts.get('users', 0) - preserved, 0)}")
    output(f"Будет создано: {len(dataset.venues)} точки, {len(dataset.employees)} сотрудников, {len(dataset.shifts)} смен")
    output(f"Период: {dataset.start_date.isoformat()} — {dataset.end_date.isoformat()}")
    output("Для применения выполните из каталога backend:")
    output(build_apply_command(dataset.end_date))


def print_apply_result(result: dict[str, int | str], output: Callable[[str], None] = print) -> None:
    output("Demo-компания создана успешно.")
    labels = (
        ("preserved_owner_admin", "Сохранено owner/admin"),
        ("venues", "Создано точек"),
        ("employees", "Создано demo-сотрудников"),
        ("shifts", "Создано смен"),
        ("approved", "Approved смен"),
        ("pending", "Pending смен"),
        ("rejected", "Rejected смен"),
        ("cross_venue_shifts", "Cross-venue смен"),
        ("adjustments", "Корректировок"),
        ("payroll_runs", "Расчётов выплат"),
        ("payroll_payments", "Фактических выплат"),
        ("date_range", "Период"),
    )
    for key, label in labels:
        output(f"{label}: {result[key]}")
    output("Текущая неделя:")
    for key, label in (
        ("week_approved", "  approved"),
        ("week_pending", "  pending"),
        ("week_rejected", "  rejected"),
        ("week_hours", "  часы"),
        ("week_accruals", "  начисления"),
        ("week_unique_employees", "  сотрудники"),
        ("week_cross_venue_shifts", "  cross-venue смены"),
        ("week_draft_payroll_runs", "  draft расчёты"),
        ("week_finalized_unpaid_runs", "  finalized с остатком"),
    ):
        output(f"{label}: {result[key]}")


async def run_with_actions(
    options: SeedOptions,
    inspect_action: Callable[[], Awaitable[dict[str, int]]],
    apply_action: Callable[[], Awaitable[dict[str, int | str]]],
    dataset: DemoDataset,
    output: Callable[[str], None] = print,
) -> int:
    if options.apply and options.confirmation != CONFIRMATION_PHRASE:
        output(f"Изменения не выполнены: для --apply требуется --confirm {CONFIRMATION_PHRASE}.")
        return 2
    if not options.apply:
        counts = await inspect_action()
        print_dry_run(counts, dataset, output)
        return 0

    output("ВНИМАНИЕ: будут удалены текущие тестовые операционные данные.")
    try:
        result = await apply_action()
    except DemoSeedError as error:
        output(f"Операция отменена, transaction rollback: {error}")
        return 1
    except Exception:
        output("Операция отменена из-за ошибки базы данных, transaction rollback выполнен.")
        return 1
    print_apply_result(result, output)
    return 0


def parse_as_of(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("--as-of должен иметь формат YYYY-MM-DD") from error


def parse_args(argv: Sequence[str] | None = None) -> SeedOptions:
    parser = argparse.ArgumentParser(description="Детерминированная demo-компания Порядок.Смены")
    parser.add_argument("--apply", action="store_true", help="применить reset и seed")
    parser.add_argument("--confirm", help=f"обязательная фраза {CONFIRMATION_PHRASE}")
    parser.add_argument("--as-of", type=parse_as_of, default=date.today(), help="дата окончания периода YYYY-MM-DD")
    args = parser.parse_args(argv)
    return SeedOptions(apply=args.apply, confirmation=args.confirm, as_of=args.as_of)


async def async_main(options: SeedOptions) -> int:
    dataset = generate_demo_dataset(options.as_of)

    async def inspect_action() -> dict[str, int]:
        async with async_session_factory() as session:
            return await inspect_database(session)

    async def apply_action() -> dict[str, int | str]:
        async with async_session_factory() as session:
            async with session.begin():
                return await apply_demo_dataset(session, dataset)

    return await run_with_actions(options, inspect_action, apply_action, dataset)


def main(argv: Sequence[str] | None = None) -> int:
    return asyncio.run(async_main(parse_args(argv)))


if __name__ == "__main__":
    sys.exit(main())
