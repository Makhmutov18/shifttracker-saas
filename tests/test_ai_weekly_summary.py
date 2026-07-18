import json
import sys
import unittest
import uuid
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import httpx
from fastapi import HTTPException
from pydantic import ValidationError


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings  # noqa: E402
from app.models import UserRole  # noqa: E402
from app.routers.ai import ensure_ai_summary_access, ensure_ai_summary_available  # noqa: E402
from app.schemas import AiWeeklySummaryRequest  # noqa: E402
from app.services.ai_summary import (  # noqa: E402
    AiSummaryProviderError,
    SYSTEM_PROMPT,
    aggregate_weekly_rows,
    build_provider_payload,
    generate_weekly_summary,
)


@contextmanager
def ai_settings(**values):
    previous = {name: getattr(settings, name) for name in values}
    try:
        for name, value in values.items():
            setattr(settings, name, value)
        yield
    finally:
        for name, value in previous.items():
            setattr(settings, name, value)


def provider_response(content: str | None, *, status_code: int = 200, usage: dict | None = None):
    payload = {
        "choices": [
            {
                "message": {"content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": usage or {},
    }
    return httpx.Response(status_code, json=payload)


class AiWeeklySummarySchemaAndAccessTests(unittest.TestCase):
    def test_owner_and_admin_have_access_employee_does_not(self) -> None:
        ensure_ai_summary_access(SimpleNamespace(role=UserRole.owner))
        ensure_ai_summary_access(SimpleNamespace(role=UserRole.admin))
        with self.assertRaises(HTTPException) as error:
            ensure_ai_summary_access(SimpleNamespace(role=UserRole.barista))
        self.assertEqual(error.exception.status_code, 403)

    def test_disabled_missing_key_and_unsupported_provider_return_503(self) -> None:
        configurations = (
            {"AI_FEATURE_ENABLED": False, "AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "test", "AI_MODEL": "model"},
            {"AI_FEATURE_ENABLED": True, "AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "", "AI_MODEL": "model"},
            {"AI_FEATURE_ENABLED": True, "AI_PROVIDER": "other", "DEEPSEEK_API_KEY": "test", "AI_MODEL": "model"},
            {"AI_FEATURE_ENABLED": True, "AI_PROVIDER": "deepseek", "DEEPSEEK_API_KEY": "test", "AI_MODEL": ""},
        )
        for configuration in configurations:
            with self.subTest(configuration=configuration), ai_settings(**configuration):
                with self.assertRaises(HTTPException) as error:
                    ensure_ai_summary_available()
                self.assertEqual(error.exception.status_code, 503)
                self.assertEqual(error.exception.detail, "Умная сводка сейчас недоступна")

    def test_date_range_validation(self) -> None:
        with self.assertRaises(ValidationError):
            AiWeeklySummaryRequest(period_start=date(2026, 7, 20), period_end=date(2026, 7, 19))
        with self.assertRaises(ValidationError):
            AiWeeklySummaryRequest(period_start=date(2026, 5, 31), period_end=date(2026, 7, 1))
        request = AiWeeklySummaryRequest(period_start=date(2026, 7, 13), period_end=date(2026, 7, 19))
        self.assertEqual((request.period_end - request.period_start).days, 6)


class AiWeeklySummaryAggregationTests(unittest.TestCase):
    def test_actual_venue_cross_venue_and_rejected_rules(self) -> None:
        employee_a = uuid.uuid4()
        employee_b = uuid.uuid4()
        home_a = uuid.uuid4()
        home_b = uuid.uuid4()
        second_venue = uuid.uuid4()
        shift_rows = [
            ("approved", Decimal("8.25"), Decimal("1200.50"), employee_a, second_venue, home_a, "Вторая точка"),
            ("pending", Decimal("6.00"), Decimal("900.00"), employee_a, second_venue, home_a, "Вторая точка"),
            ("approved", Decimal("4.00"), Decimal("500.00"), employee_b, home_b, home_b, "Главная точка"),
            ("rejected", Decimal("9.00"), Decimal("9999.00"), uuid.uuid4(), second_venue, home_a, "Вторая точка"),
        ]
        payroll_rows = [
            ("draft", Decimal("1000.00"), Decimal("0.00")),
            ("finalized", Decimal("1500.00"), Decimal("500.00")),
            ("finalized", Decimal("800.00"), Decimal("800.00")),
            ("cancelled", Decimal("400.00"), Decimal("0.00")),
        ]

        context, metrics = aggregate_weekly_rows(shift_rows, payroll_rows)

        self.assertEqual(context["totals"]["approved_shifts_count"], 2)
        self.assertEqual(context["totals"]["pending_shifts_count"], 1)
        self.assertEqual(context["totals"]["rejected_shifts_count"], 1)
        self.assertEqual(context["totals"]["approved_hours"], "12.25")
        self.assertEqual(context["totals"]["approved_accruals"], "1700.50")
        self.assertEqual(context["totals"]["pending_estimated_accruals"], "900.00")
        self.assertEqual(context["totals"]["unique_worked_employees_count"], 2)
        self.assertEqual(context["totals"]["cross_venue_shifts_count"], 2)
        self.assertEqual(context["totals"]["cross_venue_employees_count"], 1)
        self.assertEqual(context["venues"][0]["venue_name"], "Вторая точка")
        self.assertEqual(context["venues"][0]["approved_shifts_count"], 1)
        self.assertEqual(context["payroll"]["draft_payroll_runs_count"], 1)
        self.assertEqual(context["payroll"]["finalized_unpaid_payroll_runs_count"], 1)
        self.assertEqual(context["payroll"]["remaining_to_pay"], "1000.00")
        self.assertEqual(metrics.approved_hours, Decimal("12.25"))
        self.assertEqual(metrics.cross_venue_shifts_count, 2)

    def test_provider_context_contains_no_employee_identifiers(self) -> None:
        context, _ = aggregate_weekly_rows([], [])
        serialized = json.dumps(context, ensure_ascii=False)
        for forbidden in ("telegram_id", "username", "employee_name", "comment", "payment_method"):
            self.assertNotIn(forbidden, serialized)

    def test_venue_context_is_limited_to_twenty_rows(self) -> None:
        shared_employee = uuid.uuid4()
        home_venue = uuid.uuid4()
        rows = [
            (
                "approved",
                Decimal("1.00"),
                Decimal("100.00"),
                shared_employee,
                uuid.uuid4(),
                home_venue,
                f"Точка {index:02d}",
            )
            for index in range(22)
        ]
        context, _ = aggregate_weekly_rows(rows, [])
        self.assertEqual(len(context["venues"]), 20)
        self.assertEqual(context["venues"][-1]["venue_name"], "Другие точки")
        self.assertEqual(context["venues"][-1]["worked_employees_count"], 1)

    def test_provider_payload_is_json_mode_without_pii(self) -> None:
        context = {
            "totals": {"approved_accruals": "100.00"},
            "venues": [{"venue_name": "Главная точка"}],
            "payroll": {"remaining_to_pay": "0.00"},
        }
        with ai_settings(AI_MODEL="deepseek-test", AI_MAX_OUTPUT_TOKENS=777):
            payload = build_provider_payload(context)
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertEqual(payload["thinking"], {"type": "disabled"})
        self.assertFalse(payload["stream"])
        self.assertEqual(payload["max_tokens"], 777)
        self.assertIn("JSON", SYSTEM_PROMPT)
        self.assertIn("Пример JSON", SYSTEM_PROMPT)
        self.assertIn("pending shifts", SYSTEM_PROMPT)
        self.assertIn("finalized", SYSTEM_PROMPT)
        self.assertIn("cross-venue", SYSTEM_PROMPT)
        self.assertIn("разница нагрузки", SYSTEM_PROMPT)
        self.assertIn("Не повторяй один", SYSTEM_PROMPT)
        self.assertIn("1–2", SYSTEM_PROMPT)
        self.assertIn("пробелы между тысячами", SYSTEM_PROMPT)
        self.assertLess(SYSTEM_PROMPT.index("1) pending"), SYSTEM_PROMPT.index("2) finalized"))
        self.assertLess(SYSTEM_PROMPT.index("2) finalized"), SYSTEM_PROMPT.index("3) cross-venue"))
        self.assertLess(SYSTEM_PROMPT.index("3) cross-venue"), SYSTEM_PROMPT.index("4) заметная"))
        self.assertIn("Не перечисляй проверенные метрики", payload["messages"][1]["content"])
        self.assertIn("<business_data>", payload["messages"][1]["content"])


class AiWeeklySummaryProviderTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.configuration = ai_settings(
            AI_MODEL="deepseek-test",
            DEEPSEEK_API_KEY="not-a-real-key",
            DEEPSEEK_BASE_URL="https://provider.invalid",
            AI_REQUEST_TIMEOUT_SECONDS=1,
            AI_MAX_OUTPUT_TOKENS=900,
        )
        self.configuration.__enter__()
        self.context = {
            "totals": {"pending_estimated_accruals": "1800.00"},
            "venues": [],
            "payroll": {"remaining_to_pay": "53831.25"},
        }

    async def asyncTearDown(self) -> None:
        self.configuration.__exit__(None, None, None)

    async def test_valid_json_and_usage_are_accepted(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.headers["Authorization"], "Bearer not-a-real-key")
            return provider_response(
                '{"headline":"Неделя под контролем","summary":"Критичных отклонений не видно.","attention":[],"actions":["Проверить очередь утверждения"]}',
                usage={"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            )

        result = await generate_weekly_summary(self.context, httpx.MockTransport(handler))
        self.assertEqual(result.headline, "Неделя под контролем")

    async def test_empty_and_invalid_json_each_retry_once(self) -> None:
        for first_content in ("", "not-json"):
            calls: list[dict] = []

            async def handler(request: httpx.Request) -> httpx.Response:
                calls.append(json.loads(request.content))
                content = first_content if len(calls) == 1 else '{"headline":"Очередь требует проверки","summary":"Сначала разберите ожидающие смены.","attention":[],"actions":["Открыть раздел утверждения"]}'
                return provider_response(content)

            result = await generate_weekly_summary(self.context, httpx.MockTransport(handler))
            self.assertEqual(result.headline, "Очередь требует проверки")
            self.assertEqual(len(calls), 2)
            self.assertIn("Предыдущий ответ был невалидным", calls[1]["messages"][1]["content"])
            if first_content:
                self.assertNotIn(first_content, calls[1]["messages"][1]["content"])

    async def test_generic_headline_retries_with_conclusion(self) -> None:
        calls = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            content = (
                '{"headline":"Сводка за период: текущая неделя","summary":"Есть задачи.","attention":[],"actions":["Открыть смены"]}'
                if calls == 1
                else '{"headline":"Ожидающие смены требуют решения","summary":"Сначала закройте очередь подтверждения.","attention":[],"actions":["Открыть раздел утверждения"]}'
            )
            return provider_response(content)

        result = await generate_weekly_summary(self.context, httpx.MockTransport(handler))
        self.assertEqual(result.headline, "Ожидающие смены требуют решения")
        self.assertEqual(calls, 2)

    async def test_repeated_signal_between_summary_and_attention_is_rejected(self) -> None:
        async def handler(request: httpx.Request) -> httpx.Response:
            return provider_response(
                '{"headline":"Нужна проверка","summary":"Ожидающие смены требуют решения.",'
                '"attention":["Проверьте смены на подтверждении"],"actions":["Открыть раздел утверждения"]}'
            )

        with self.assertRaises(AiSummaryProviderError) as error:
            await generate_weekly_summary(self.context, httpx.MockTransport(handler))
        self.assertEqual(error.exception.status_code, 502)

    async def test_actions_are_limited_to_one_or_two(self) -> None:
        for actions in ([], ["Первое", "Второе", "Третье"]):
            async def handler(request: httpx.Request, value=actions) -> httpx.Response:
                return provider_response(json.dumps({
                    "headline": "Есть рабочие задачи",
                    "summary": "Приоритет определён.",
                    "attention": [],
                    "actions": value,
                }, ensure_ascii=False))

            with self.subTest(actions=actions), self.assertRaises(AiSummaryProviderError):
                await generate_weekly_summary(self.context, httpx.MockTransport(handler))

    async def test_money_requires_russian_format_or_omission(self) -> None:
        invalid_summaries = ("Осталось 53831.25.", "Осталось 53 831,25 рублей.")
        for invalid_summary in invalid_summaries:
            responses = iter((
                json.dumps({
                    "headline": "Есть остаток",
                    "summary": invalid_summary,
                    "attention": [],
                    "actions": ["Открыть расчёты"],
                }, ensure_ascii=False),
                '{"headline":"Есть остаток","summary":"Осталось 53 831,25 ₽.","attention":[],"actions":["Открыть расчёты"]}',
            ))

            async def handler(request: httpx.Request) -> httpx.Response:
                return provider_response(next(responses))

            with self.subTest(invalid_summary=invalid_summary):
                result = await generate_weekly_summary(self.context, httpx.MockTransport(handler))
                self.assertEqual(result.summary, "Осталось 53 831,25 ₽.")

    async def test_verified_metrics_are_not_repeated_in_ai_text(self) -> None:
        context = {
            "totals": {
                "approved_shifts_count": 37,
                "approved_hours": "285.00",
                "approved_accruals": "90155.50",
                "unique_worked_employees_count": 11,
                "pending_estimated_accruals": "0.00",
            },
            "venues": [],
            "payroll": {"remaining_to_pay": "0.00"},
        }
        responses = iter((
            '{"headline":"Работа идёт стабильно","summary":"Утверждено 37 смен, отработано 285 часов и задействовано 11 сотрудников.","attention":[],"actions":["Проверить очередь"]}',
            '{"headline":"Работа идёт стабильно","summary":"Критичных отклонений по утверждённой работе не видно.","attention":[],"actions":["Проверить очередь"]}',
        ))

        async def handler(request: httpx.Request) -> httpx.Response:
            return provider_response(next(responses))

        result = await generate_weekly_summary(context, httpx.MockTransport(handler))
        self.assertNotIn("37", result.summary)
        self.assertNotIn("285", result.summary)
        self.assertNotIn("11", result.summary)

    async def test_second_invalid_json_returns_502(self) -> None:
        calls = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return provider_response("invalid")

        with self.assertRaises(AiSummaryProviderError) as error:
            await generate_weekly_summary(self.context, httpx.MockTransport(handler))
        self.assertEqual(error.exception.status_code, 502)
        self.assertEqual(calls, 2)

    async def test_timeout_is_504_without_retry(self) -> None:
        calls = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            raise httpx.ReadTimeout("secret timeout detail", request=request)

        with self.assertRaises(AiSummaryProviderError) as error:
            await generate_weekly_summary(self.context, httpx.MockTransport(handler))
        self.assertEqual(error.exception.status_code, 504)
        self.assertEqual(calls, 1)
        self.assertNotIn("secret", error.exception.public_message)

    async def test_rate_limit_and_provider_errors_are_safe_without_retry(self) -> None:
        for provider_status, expected_status in ((429, 503), (401, 503), (500, 502)):
            calls = 0

            async def handler(request: httpx.Request, status=provider_status) -> httpx.Response:
                nonlocal calls
                calls += 1
                return httpx.Response(status, json={"error": {"message": "provider secret body"}})

            with self.subTest(provider_status=provider_status):
                with self.assertRaises(AiSummaryProviderError) as error:
                    await generate_weekly_summary(self.context, httpx.MockTransport(handler))
                self.assertEqual(error.exception.status_code, expected_status)
                self.assertEqual(calls, 1)
                self.assertNotIn("provider secret body", error.exception.public_message)

    async def test_service_has_no_database_write_path(self) -> None:
        source = (BACKEND_DIR / "app" / "services" / "ai_summary.py").read_text(encoding="utf-8")
        self.assertNotIn("session.add", source)
        self.assertNotIn("session.commit", source)
        self.assertNotIn("session.flush", source)
        self.assertNotIn("AuditLog", source)


if __name__ == "__main__":
    unittest.main()
