# Backend PostgreSQL integration tests

These tests freeze the current single-tenant schema, payroll, venue and permission behavior before multitenancy work begins. They require real PostgreSQL and intentionally refuse SQLite. The database name must contain a separate underscore-delimited `test` segment (for example `shifttracker_test`), not just a substring such as `contest`.

Fixtures destroy and recreate the entire public schema. Never use production or a shared development database. Direct pytest runs require `TEST_DATABASE_ALLOW_RESET=1`; the external runner requires `--allow-reset`. URLs targeting the configured `DATABASE_URL` are rejected even with a different driver, credentials or loopback hostname. Query-string connection overrides are rejected. Before cleanup, fixtures also verify the application's engine and the connected database. Test connections have statement and lock timeouts to avoid indefinite hangs.

From the repository root:

```powershell
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python backend/scripts/run_integration_tests.py --repeat 2
```

Manual Compose flow:

```powershell
docker compose -f docker-compose.test.yml up -d --wait
$env:TEST_DATABASE_URL = "postgresql+asyncpg://shifttracker_test:shifttracker_test_only@127.0.0.1:55432/shifttracker_test"
$env:TEST_DATABASE_ALLOW_RESET = "1"
python -m pytest backend/tests/integration -q
docker compose -f docker-compose.test.yml down -v
```

External PostgreSQL:

```powershell
$env:TEST_DATABASE_URL = "postgresql+asyncpg://USER:PASSWORD@HOST:PORT/isolated_test_database"
python backend/scripts/run_integration_tests.py --external --allow-reset --repeat 2
```

The reviewed expected values live in `backend/tests/fixtures/financial_baseline.json`. Tests read this file but never regenerate it. Update it only in an explicit payroll-behavior change with review.

## CI command

A GitHub Actions workflow is intentionally not committed in Phase 0 because GitHub rejected workflow changes from the repository automation credential without `workflow` scope. Until a maintainer approves that capability, configure a PostgreSQL 16 CI service and run:

```bash
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python -m compileall backend/app backend/scripts backend/tests
python -m unittest discover -s tests -t . -q
TEST_DATABASE_URL="postgresql+asyncpg://TEST_USER:TEST_PASSWORD@127.0.0.1:5432/shifttracker_test" \
  python backend/scripts/run_integration_tests.py --external --allow-reset --repeat 2
git diff --check
```

Use only disposable CI credentials and never inject production secrets, Telegram network access or AI provider keys.

## Verified local baseline (2026-10-12)

- PostgreSQL 18, a newly initialized disposable cluster bound to `127.0.0.1:55439`, outside the existing PostgreSQL service.
- Two consecutive integration runs: **18 passed each**. No production database, Railway, Telegram or AI calls.
- Repeated bootstrap releases the test session's read transaction before running compatibility DDL in a separate connection.
- Invite tests use a SQLAlchemy URL object for the synchronous driver, preserving the password without printing it.
- Seven unit tests cover the destructive-fixture safety checks without requiring a database.
- This is a serial functional baseline, not evidence of concurrent payroll safety. Payroll source reservation and cancellation/payment races still need focused real-PostgreSQL concurrency tests.
- PostgreSQL 16 remains the Compose/CI target; that version and Docker startup were not exercised locally.
