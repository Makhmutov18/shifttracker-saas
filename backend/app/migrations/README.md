# PostgreSQL migrations

Apply versioned SQL migrations to the production database before deploying the matching backend code.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/app/migrations/20260718_add_payroll_run_revenue.sql
```

The migrations are idempotent and preserve existing data. Existing payroll runs receive `NULL` for `revenue_total`.
