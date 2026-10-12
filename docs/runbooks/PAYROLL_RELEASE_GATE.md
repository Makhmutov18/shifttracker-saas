# Payroll workflow verification and release gate

Date: 13 October 2026. Branch: `feature/multitenant-phase-0`.
Application baseline: `e3c785002eaf76d06567f60a164014a797c4d6fc`.

## Scope and result boundary

This checkpoint verifies the current payroll workflow, not completion of the multitenancy roadmap or authorization to deploy. No production connection, migration, Telegram notification, real AI request, main merge or deployment was performed. Application code and formulas did not need changes for the new workflow tests.

The new PostgreSQL scenarios use real ASGI routes, SQLAlchemy transactions, calendar suggestions, accrual calculations, source reservations and payment persistence. The integration fixture overrides current-user resolution and supplies deterministic local users; these scenarios are not an end-to-end Telegram/OIDC login test. Only the shift submission clock is frozen to satisfy the existing today/yesterday rule. Root auth regression tests remain a separate check.

## Verified workflows

`backend/tests/integration/test_payroll_workflow.py` adds ten scenarios:

- Eight combinations of hourly/fixed-shift/revenue/hybrid pay and 20/5 or 25/10 calendars.
- Employee shift creation, duplicate-shift rejection, owner approval/rejection, pending exclusion and August boundary exclusion.
- Inclusive July 1-15 and 16-31 periods, including shifts on July 15, 16 and 31 and explicitly dated bonuses/deductions on July 15/16.
- Expenses do not reduce personal accruals. Cross-venue shifts and adjustments stay with their actual/assigned accrual venue, not the employee's home venue.
- Preview and saved items have matching amounts; the monthly venue summary matches the two non-overlapping snapshots before source edits.
- A broad overlapping run fails with 409 without new runs/items/source links/payments. A different venue with distinct sources succeeds.
- Settings/source edits do not rewrite saved items or planned dates. Reserved adjustment dates cannot be moved. Draft/cancelled calculations remain hidden from personal history.
- Partial cash payment, full remaining bank payment, actual date distinct from planned date, retries retaining the same payment, rejected overpayment and paid-source reuse.
- Employee history returns only personal amounts/payments and omits management revenue/share. A user_id query cannot expose another person's history; payroll viewers cannot mutate or read another venue.
- Two cancellation/replacement scenarios (draft and finalized without payments) preserve cancelled snapshot history and release sources for a new calculation. Partially paid finalized runs cannot be cancelled.

## Automated checks

- New PostgreSQL workflow subset: 10 passed.
- Full PostgreSQL integration suite: 112 passed.
- Root unittest suite: 209 passed.
- Client Node suite: 57 passed.
- Mini App Vite production build: passed.
- Web-admin TypeScript/Vite production build: passed.
- Backend compilation and diff checks: passed.

Existing Pydantic class-config deprecation remains non-blocking technical debt, not a newly introduced workflow failure.

Browser QA, Telegram client QA, staging login/webhook smoke tests, production-data inventory and backup restoration have not been performed in this checkpoint. No dev/mock server or screenshots were created. Browser work requires an explicit `VISUAL_QA_REQUIRED` task under the repository process.

## Before any approved rollout

1. Review the feature-branch changes against a freshly fetched main. This branch includes auth/startup hardening, shift authorization, concurrency, idempotency, report revenue semantics, accrual-date review and schedules; do not deploy it as if it were only a UI change. Check for intervening main commits before integration.
2. Take an encrypted production backup and prove restoration into an isolated database using `DATABASE_BASELINE_AND_RESTORE.md`. Reconcile financial snapshots, source references, user roles and inactive users. Local synthetic fixtures are not evidence of real-data compatibility.
3. Inventory undated adjustments, conflicting active schedule rows, existing source/payment inconsistencies and schema/index state read-only. Do not assign legacy dates from creation timestamps or automatically reclassify advance-labelled deductions.
4. Rehearse the existing additive SQL on the restored database: existing revenue support `20260718_add_payroll_run_revenue.sql`, then `20261012_add_payment_idempotency.sql`, `20261012_add_adjustment_accrual_date.sql`, `20261012_add_planned_payment_date.sql`. Check schema and unchanged financial values afterward. Never run the integration schema-reset runner against a restored production copy or production itself.
5. Deploy schema/backend before clients in an approved staging environment. Confirm server time, valid/expired Mini App initData, inactive-user denial, cookie CSRF, OIDC login and webhook secret registration. Startup must not promote/reactivate users; do not run explicit bootstrap as a routine deploy step. See `AUTH_HARDENING.md`.
6. Run one explicit visual smoke task for management creation/settings/errors and employee read-only history in both clients, narrow layout and light/dark themes. Verify real Telegram behavior separately from browser mocks.
7. Review observed results and obtain explicit approval before merging main or touching production. Preserve a known-good build and rollback plan. Runtime compatibility DDL is still present; this increment is not the future tenant migration system.

## Rollback boundary

Keep additive nullable columns and their existing data when rolling application code back; do not drop them as an emergency response. Older clients omit planned dates and remain manual. Never undo actual payment rows or restore a stale database backup merely to reverse a UI release. If new payments or calculations were recorded, reconcile them before rollback.

Do not silently roll back authentication protections or payment idempotency guarantees. Earlier clients may omit payment operation keys, so safe retry behavior depends on deploying the updated clients with the backend. Define a reviewed rollback build or disable affected writes operationally rather than assuming any old commit is safe.

## Still outside this release

Workspace/organization isolation and identity migration, statutory accounting/taxes, gross/net pay, holiday calendars, automatic runs/reminders and automatic legacy advance reconciliation require separate scoped work. Negative employee accrual policy is not changed by these positive-balance scenarios. Schedules suggest dates; they neither transfer money nor prove legal payroll compliance.
