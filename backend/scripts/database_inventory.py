from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import asyncpg


CRITICAL_NULL_FIELDS = {
    "users": ("name", "role", "venue_id", "hourly_rate", "pay_model", "is_active"),
    "venues": ("name", "is_active"),
    "shifts": ("user_id", "venue_id", "date", "total_hours", "salary_earned", "status"),
    "adjustments": ("user_id", "venue_id", "type", "amount", "month", "year"),
    "payroll_runs": ("period_start", "period_end", "status", "total_amount", "total_paid", "created_by_id"),
    "payroll_run_items": ("payroll_run_id", "user_id", "final_amount", "paid_amount", "remaining_amount"),
    "payroll_payments": ("payroll_run_id", "user_id", "amount", "payment_date", "created_by_id"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Read-only ShiftTracker PostgreSQL inventory")
    parser.add_argument("--environment", required=True, choices=("test", "development", "production"))
    parser.add_argument(
        "--url-env",
        default="INVENTORY_DATABASE_URL",
        help="Environment variable containing the database URL (the URL is never printed)",
    )
    parser.add_argument("--output", type=Path, help="Optional JSON output path; stdout is used otherwise")
    parser.add_argument("--confirm-production-read-only", action="store_true")
    return parser.parse_args()


def normalize_url(value: str) -> str:
    return value.replace("postgresql+asyncpg://", "postgresql://", 1).replace("postgres://", "postgresql://", 1)


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


async def table_exists(connection: asyncpg.Connection, table: str) -> bool:
    return bool(await connection.fetchval("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        )
    """, table))


async def collect_inventory(connection: asyncpg.Connection, environment: str) -> dict[str, Any]:
    tables = [row["table_name"] for row in await connection.fetch("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)]
    columns: dict[str, list[dict[str, Any]]] = {}
    row_counts: dict[str, int] = {}
    for table in tables:
        columns[table] = [dict(row) for row in await connection.fetch("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        """, table)]
        row_counts[table] = int(await connection.fetchval(
            f"SELECT count(*) FROM {quote_identifier(table)}"
        ))

    null_counts: dict[str, dict[str, int]] = {}
    available_columns = {
        table: {column["column_name"] for column in table_columns}
        for table, table_columns in columns.items()
    }
    for table, fields in CRITICAL_NULL_FIELDS.items():
        if table not in available_columns:
            continue
        selected = [field for field in fields if field in available_columns[table]]
        if not selected:
            continue
        expressions = ", ".join(
            f"count(*) FILTER (WHERE {quote_identifier(field)} IS NULL) AS {quote_identifier(field)}"
            for field in selected
        )
        row = await connection.fetchrow(f"SELECT {expressions} FROM {quote_identifier(table)}")
        null_counts[table] = {field: int(row[field]) for field in selected}

    duplicates = {"telegram_id_groups": 0, "invite_token_groups": 0}
    if "users" in tables:
        duplicates["telegram_id_groups"] = int(await connection.fetchval("""
            SELECT count(*) FROM (
                SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL
                GROUP BY telegram_id HAVING count(*) > 1
            ) duplicate_groups
        """))
        duplicates["invite_token_groups"] = int(await connection.fetchval("""
            SELECT count(*) FROM (
                SELECT invite_token FROM users WHERE invite_token IS NOT NULL
                GROUP BY invite_token HAVING count(*) > 1
            ) duplicate_groups
        """))

    orphan_queries = {
        "users_without_venue": "SELECT count(*) FROM users u LEFT JOIN venues v ON v.id=u.venue_id WHERE v.id IS NULL",
        "shifts_without_user": "SELECT count(*) FROM shifts s LEFT JOIN users u ON u.id=s.user_id WHERE u.id IS NULL",
        "shifts_without_venue": "SELECT count(*) FROM shifts s LEFT JOIN venues v ON v.id=s.venue_id WHERE v.id IS NULL",
        "payroll_items_without_run": "SELECT count(*) FROM payroll_run_items i LEFT JOIN payroll_runs r ON r.id=i.payroll_run_id WHERE r.id IS NULL",
        "payments_without_run": "SELECT count(*) FROM payroll_payments p LEFT JOIN payroll_runs r ON r.id=p.payroll_run_id WHERE r.id IS NULL",
        "shift_sources_without_shift": "SELECT count(*) FROM payroll_run_shift_sources s LEFT JOIN shifts x ON x.id=s.shift_id WHERE x.id IS NULL",
        "adjustment_sources_without_adjustment": "SELECT count(*) FROM payroll_run_adjustment_sources s LEFT JOIN adjustments a ON a.id=s.adjustment_id WHERE a.id IS NULL",
    }
    required_tables = {
        "users_without_venue": {"users", "venues"},
        "shifts_without_user": {"shifts", "users"},
        "shifts_without_venue": {"shifts", "venues"},
        "payroll_items_without_run": {"payroll_run_items", "payroll_runs"},
        "payments_without_run": {"payroll_payments", "payroll_runs"},
        "shift_sources_without_shift": {"payroll_run_shift_sources", "shifts"},
        "adjustment_sources_without_adjustment": {"payroll_run_adjustment_sources", "adjustments"},
    }
    orphans = {
        name: int(await connection.fetchval(query))
        for name, query in orphan_queries.items()
        if required_tables[name] <= set(tables)
    }

    shift_status_counts = {}
    if "shifts" in tables:
        shift_status_counts = {
            str(row["status"]): int(row["count"])
            for row in await connection.fetch("SELECT status, count(*) AS count FROM shifts GROUP BY status ORDER BY status")
        }

    financial: dict[str, Any] = {}
    if "shifts" in tables:
        row = await connection.fetchrow("""
            SELECT count(*) AS count,
                   coalesce(sum(total_hours), 0)::text AS hours,
                   coalesce(sum(salary_earned), 0)::text AS salary,
                   md5(coalesce(string_agg(id::text || ':' || salary_earned::text, ',' ORDER BY id), '')) AS checksum
            FROM shifts WHERE status = 'approved'
        """)
        financial["approved_shifts"] = dict(row)
    if "adjustments" in tables:
        financial["adjustments"] = [dict(row) for row in await connection.fetch("""
            SELECT type::text AS type, count(*) AS count, coalesce(sum(amount), 0)::text AS amount,
                   md5(coalesce(string_agg(id::text || ':' || amount::text, ',' ORDER BY id), '')) AS checksum
            FROM adjustments GROUP BY type ORDER BY type
        """)]
    if "payroll_runs" in tables:
        financial["payroll_runs"] = dict(await connection.fetchrow("""
            SELECT count(*) AS count,
                   coalesce(sum(total_amount), 0)::text AS total_amount,
                   coalesce(sum(total_paid), 0)::text AS total_paid,
                   md5(coalesce(string_agg(id::text || ':' || total_amount::text || ':' || total_paid::text, ',' ORDER BY id), '')) AS checksum
            FROM payroll_runs
        """))
    if "payroll_payments" in tables:
        financial["payroll_payments"] = dict(await connection.fetchrow("""
            SELECT count(*) AS count, coalesce(sum(amount), 0)::text AS amount,
                   md5(coalesce(string_agg(id::text || ':' || amount::text, ',' ORDER BY id), '')) AS checksum
            FROM payroll_payments
        """))

    source_counts = {}
    for table in ("payroll_run_shift_sources", "payroll_run_adjustment_sources"):
        if table in tables:
            source_counts[table] = row_counts[table]

    return {
        "environment": environment,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "postgresql_version": await connection.fetchval("SHOW server_version"),
        "extensions": [row["extname"] for row in await connection.fetch("SELECT extname FROM pg_extension ORDER BY extname")],
        "tables": tables,
        "row_counts": row_counts,
        "columns": columns,
        "critical_null_counts": null_counts,
        "duplicate_groups": duplicates,
        "orphan_counts": orphans,
        "shift_status_counts": shift_status_counts,
        "financial": financial,
        "payroll_source_counts": source_counts,
    }


async def run(args: argparse.Namespace) -> int:
    if args.environment == "production" and not args.confirm_production_read_only:
        raise SystemExit("Production inventory requires --confirm-production-read-only")
    raw_url = os.getenv(args.url_env, "").strip()
    if not raw_url:
        raise SystemExit(f"Missing explicit database URL environment variable: {args.url_env}")

    connection = await asyncpg.connect(normalize_url(raw_url), server_settings={"application_name": "shifttracker_read_only_inventory"})
    try:
        async with connection.transaction(readonly=True):
            payload = await collect_inventory(connection, args.environment)
    finally:
        await connection.close()

    rendered = json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parse_args())))
