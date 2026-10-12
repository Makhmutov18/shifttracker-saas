# PostgreSQL migrations

Apply versioned SQL migrations to the production database before deploying the matching backend code.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/app/migrations/20260718_add_payroll_run_revenue.sql
```

The migrations are idempotent and preserve existing data. Existing payroll runs receive `NULL` for `revenue_total`.

For payment retry protection, apply `20261012_add_payment_idempotency.sql` before deploying the matching frontend. It adds a nullable UUID operation key and a unique `(payroll_run_id, idempotency_key)` index. Existing payments retain `NULL`; amounts and snapshots are unchanged. The same additive SQL is present in runtime `init_db` compatibility initialization. Deploy backend/schema support before clients start sending operation keys.

For explicit adjustment dates, apply `20261012_add_adjustment_accrual_date.sql` before deploying the matching backend/clients. It adds nullable `adjustments.accrual_date` without backfilling historical records. Runtime `init_db` contains the same idempotent SQL. See `docs/security/ADJUSTMENT_ACCRUAL_DATES.md` for partial-period guards and manual dating of unused legacy records.

For planned payroll dates, apply `20261012_add_planned_payment_date.sql` before deploying the matching backend/clients. It adds nullable `payroll_runs.planned_payment_date`. Historical runs remain NULL; no payment dates or amounts are inferred. Runtime `init_db` includes the same additive SQL. See `docs/architecture/PAYROLL_SCHEDULES.md` for the initial per-venue schedule workflow and its limits.
