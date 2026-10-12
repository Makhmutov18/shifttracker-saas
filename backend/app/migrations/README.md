# PostgreSQL migrations

Apply versioned SQL migrations to the production database before deploying the matching backend code.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/app/migrations/20260718_add_payroll_run_revenue.sql
```

The migrations are idempotent and preserve existing data. Existing payroll runs receive `NULL` for `revenue_total`.

For payment retry protection, apply `20261012_add_payment_idempotency.sql` before deploying the matching frontend. It adds a nullable UUID operation key and a unique `(payroll_run_id, idempotency_key)` index. Existing payments retain `NULL`; amounts and snapshots are unchanged. The same additive SQL is present in runtime `init_db` compatibility initialization. Deploy backend/schema support before clients start sending operation keys.
