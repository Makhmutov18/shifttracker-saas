# Backend PostgreSQL integration tests

These tests freeze the current single-tenant schema, payroll, venue and permission behavior before multitenancy work begins. They require real PostgreSQL and intentionally refuse SQLite or a database whose name does not contain `test`.

From the repository root:

```powershell
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python backend/scripts/run_integration_tests.py --repeat 2
```

Manual Compose flow:

```powershell
docker compose -f docker-compose.test.yml up -d --wait
$env:TEST_DATABASE_URL = "postgresql+asyncpg://shifttracker_test:shifttracker_test_only@127.0.0.1:55432/shifttracker_test"
python -m pytest backend/tests/integration -q
docker compose -f docker-compose.test.yml down -v
```

External PostgreSQL:

```powershell
$env:TEST_DATABASE_URL = "postgresql+asyncpg://USER:PASSWORD@HOST:PORT/isolated_test_database"
python backend/scripts/run_integration_tests.py --external --repeat 2
```

The reviewed expected values live in `backend/tests/fixtures/financial_baseline.json`. Tests read this file but never regenerate it. Update it only in an explicit payroll-behavior change with review.

## CI command

A GitHub Actions workflow is intentionally not committed in Phase 0 because GitHub rejected workflow changes from the repository automation credential without `workflow` scope. Until a maintainer approves that capability, configure a PostgreSQL 16 CI service and run:

```bash
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python -m compileall backend/app backend/scripts backend/tests
PYTHONPATH=backend python -m unittest discover -s tests -q
TEST_DATABASE_URL="postgresql+asyncpg://TEST_USER:TEST_PASSWORD@127.0.0.1:5432/shifttracker_test" \
  python backend/scripts/run_integration_tests.py --external --repeat 2
git diff --check
```

Use only disposable CI credentials and never inject production secrets, Telegram network access or AI provider keys.
