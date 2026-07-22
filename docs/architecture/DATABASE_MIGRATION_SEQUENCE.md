# Database migration sequence

## Objective

Move the working single-tenant database to an organization-scoped schema without changing payroll history, UUID references or current client behavior during the transition.

This is an expand-and-contract migration. Destructive cleanup is intentionally delayed until production verification, client cutover and restore rehearsal are complete.

## Current database risks confirmed in code

- `backend/app/database.py::init_db` runs `Base.metadata.create_all` and raw compatibility DDL during every application startup.
- The compatibility SQL both adds schema and repairs data, so deploy and migration lifecycles are coupled.
- `backend/app/main.py` starts `init_db` and also creates/reactivates a hardcoded owner and default venue.
- Alembic is present in `backend/requirements.txt`, but there is no authoritative revision chain.
- `backend/app/migrations/20260718_add_payroll_run_revenue.sql` is a manually applied production migration, not part of a complete migration history.
- Most foreign keys can validate an ID but cannot validate that both rows belong to the same organization.

Before multitenancy, production startup must stop being the schema migration mechanism.

## Non-negotiable data invariants

- Preserve every existing UUID referenced by shifts, adjustments, audit logs and payroll snapshots.
- Preserve `Shift.salary_earned` exactly; never recalculate historical accruals from current employee rates.
- Preserve `User.venue_id` as home venue through `EmployeeProfile.home_venue_id`.
- Preserve `Shift.venue_id` as actual work venue.
- Preserve payroll run/item/source/payment snapshots, statuses, paid amounts and remaining amounts exactly.
- Preserve approved-only financial semantics.
- Preserve existing formulas in `backend/app/utils.py::calculate_salary`, `calculate_payout_total` and `calculate_payroll_share`.
- Never silently merge people by name or Telegram display data.

## Phase A: inventory, backup and migration baseline

1. Put a temporary change freeze on production schema changes.
2. Capture:
   - PostgreSQL version and extensions;
   - exact schema dump;
   - Alembic/manual migration state;
   - table row counts;
   - nullable/orphan/duplicate checks listed below;
   - checksum aggregates for financial snapshots.
3. Create an encrypted `pg_dump --format=custom` and a separate schema-only dump.
4. Restore that dump into an isolated PostgreSQL instance and run smoke queries. A backup without a restore test is not a rollback plan.
5. Configure Alembic against the actual current schema. Generate a baseline revision that represents current production without recreating existing objects.
6. Compare baseline metadata with production, then `alembic stamp <baseline>` only after explicit verification.

Rollback: no schema is changed. If the baseline differs, fix the revision and repeat; never stamp through a mismatch.

## Phase B: add identity and organization foundation

Add, without removing current `users` fields:

- `accounts`
- `account_identities`
- `organizations`
- `organization_memberships`
- `employee_profiles`
- `invites`
- account-based `sessions` or additive account columns on the existing session table
- `platform_role_assignments`
- `platform_audit_logs`

Create one deterministic legacy organization:

- stable UUID stored in migration code/configuration;
- name based on current deployment configuration;
- unique slug;
- timezone copied from the product's existing operational timezone.

Backfill identities:

1. For each user with `telegram_id`, create one account and one Telegram identity.
2. Copy display name and normalized avatar metadata.
3. Create a membership whose `id` equals the current `users.id`.
4. Create employee profile and split role/payroll fields according to `MULTITENANCY_AND_IDENTITY.md`.
5. For history-bearing users without Telegram identity, create provisional accounts without identities.
6. For unclaimed users without history, convert onboarding intent to an invite where safe.

Keep a migration reconciliation table or exported mapping of `legacy_user_id -> account_id -> membership_id`. It is operational evidence and must not contain plaintext invite tokens.

Rollback: application continues reading `users`; new tables are additive and may remain unused. Do not delete them during an emergency rollback unless they block startup.

## Phase C: add nullable organization shadow columns

Add nullable `organization_id` to:

- `venues`
- `shifts`
- `expenses`
- `audit_logs`
- `adjustments`
- `payroll_runs`
- `payroll_run_items`
- `payroll_run_shift_sources`
- `payroll_run_adjustment_sources`
- `payroll_payments`
- `payroll_schedule_settings`

Backfill in dependency order:

1. All existing venues -> legacy organization.
2. Memberships/profiles -> legacy organization and current home venue.
3. Shifts -> organization of `Shift.venue_id`; verify referenced employee membership matches it.
4. Expenses, adjustments and audit logs -> organization of their concrete venue; where venue is nullable, use the target membership/entity or legacy organization only after an explicit consistency query.
5. Payroll runs -> concrete venue organization. Existing all-venue runs use the legacy organization directly.
6. Payroll items, payments and source links -> organization of their parent payroll run.
7. Schedule settings -> venue organization or legacy organization for organization-wide settings.

Use bounded batches with observable progress for large tables. Do not hold one table-wide transaction for the entire production dataset.

Rollback: old reads remain authoritative; shadow columns can be ignored. Never clear completed backfills during rollback.

## Phase D: dual-write and scoped reads

Deploy application compatibility code that:

- writes both current user relationships and the new account/membership/profile structure;
- always sets `organization_id` on new tenant rows;
- runs existing `/api` requests in the legacy organization context;
- exposes no multi-organization selection yet;
- records mismatch metrics between old and new read models.

Background verification compares:

- current user access versus migrated membership permissions;
- employee home venue and payroll settings;
- shift counts and accrual sums;
- payroll snapshot totals and payments;
- audit visibility.

Rollback: revert application version. Additive data remains and can be reconciled before retry.

## Phase E: indexes and cross-tenant constraints

Create tenant-leading indexes, using concurrent index creation where PostgreSQL and deployment tooling allow it:

- `(organization_id, id)` on tenant parent tables;
- `(organization_id, venue_id, date)` on shifts;
- `(organization_id, user/membership_id, date)` on personal event tables;
- `(organization_id, status, period_start, period_end)` on payroll runs;
- `(organization_id, created_at)` on audit logs;
- unique `(provider, provider_subject)` on account identities;
- unique `(organization_id, account_id)` on memberships;
- unique active-source constraints needed by payroll duplicate protection.

Add composite foreign keys as `NOT VALID` first, for example:

```sql
FOREIGN KEY (organization_id, venue_id)
  REFERENCES venues (organization_id, id) NOT VALID;
```

Then validate separately after mismatch queries return zero. Finally set organization columns `NOT NULL` in a separate deployment, using validated check constraints first if table size makes direct `SET NOT NULL` unsafe.

The database must reject:

- a shift whose employee and actual venue belong to different organizations;
- a payroll item/payment/source linked to a run in another organization;
- an adjustment referencing a foreign membership or venue;
- an invite whose defaults reference another organization's venue.

Rollback: drop only the newly failing constraint or revert the application. Keep populated organization columns and indexes.

## Phase F: subscription and v1 schema

Add:

- `organization_subscriptions`
- `billing_transactions`
- optional `organization_settings`
- `idempotency_records`
- mobile/device session fields when the mobile API is introduced

Backfill the legacy organization to an explicit manual pilot or active state so deployment does not accidentally lock the current customer. Record the reason and actor as a platform audit event.

Deploy `/api/v1/organizations/{slug}` on the constrained tenant schema. Existing `/api` routes call the same scoped service layer.

Rollback: disable v1 traffic and subscription write gates behind configuration. Preserve subscription/audit history.

## Phase G: cutover and delayed cleanup

Only after all gates pass:

1. Migrate web-admin URLs and API calls to explicit organization paths.
2. Migrate Mini App selection/invite flow.
3. Build native clients only on v1.
4. Stop writes to legacy `users` responsibility fields.
5. Observe at least one full payroll cycle with zero reconciliation mismatches.
6. Take and restore-test a fresh backup.
7. Remove runtime schema mutation from `init_db`; startup checks the expected migration revision and runs no DDL.
8. Replace the hardcoded startup owner/default venue with an explicit one-time bootstrap command.
9. Deprecate legacy columns/routes with a dated removal window.

Dropping or renaming legacy columns is a later migration, not part of the first multitenancy release.

## Verification queries

Exact table/column names may change in implementation, but every migration release must provide equivalent queries and expected zero counts.

```sql
-- Missing tenant ownership
SELECT count(*) FROM shifts WHERE organization_id IS NULL;

-- Actual venue and shift tenant mismatch
SELECT count(*)
FROM shifts s
JOIN venues v ON v.id = s.venue_id
WHERE s.organization_id <> v.organization_id;

-- Employee and shift tenant mismatch
SELECT count(*)
FROM shifts s
JOIN organization_memberships m ON m.id = s.user_id
WHERE s.organization_id <> m.organization_id;

-- Payroll item parent mismatch
SELECT count(*)
FROM payroll_run_items i
JOIN payroll_runs r ON r.id = i.payroll_run_id
WHERE i.organization_id <> r.organization_id;

-- Duplicate identity
SELECT provider, provider_subject, count(*)
FROM account_identities
GROUP BY provider, provider_subject
HAVING count(*) > 1;

-- Duplicate organization membership
SELECT organization_id, account_id, count(*)
FROM organization_memberships
GROUP BY organization_id, account_id
HAVING count(*) > 1;
```

Financial checks compare pre/post migration aggregates and row-level hashes:

- shift count by status and venue;
- sum of approved `Shift.salary_earned` by employee and month;
- adjustment bonus/deduction totals by employee, venue and month;
- payroll run `total_amount`, `total_paid`, `revenue_total`;
- item `final_amount`, `paid_amount`, `remaining_amount`;
- payment count and amount;
- source-link counts.

Any mismatch blocks constraint validation and cutover.

## Test and release matrix

Before each migration phase:

- clean database upgrade from empty schema;
- upgrade from an anonymized production snapshot;
- repeated migration command is rejected or safely idempotent according to Alembic semantics;
- old application version against additive schema;
- new application version before and after backfill;
- rollback to prior application version;
- backup restore followed by migration;
- PostgreSQL integration tests for composite constraints and concurrent writes.

Do not rely on current AST/source-string tests for migration correctness. Add real PostgreSQL tests that execute revisions and domain queries.

## Timeweb execution model

- Run migrations as a one-off release command before starting the new application image.
- The application container must not own database storage.
- Prefer managed PostgreSQL; otherwise use a dedicated persistent volume and independent backup job.
- Add `/health/live` for process health and `/health/ready` for database connectivity plus expected migration revision.
- Block traffic until readiness passes.
- Store encrypted backups off-host with retention and periodic restore drills.
- Replace Railway-only public-domain discovery with explicit `PUBLIC_BASE_URL`, Mini App/admin URLs and Telegram webhook base URL.
