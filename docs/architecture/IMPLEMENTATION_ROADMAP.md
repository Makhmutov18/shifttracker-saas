# Implementation roadmap

## Approach

Build the product foundation in reversible stages while keeping the Telegram Mini App MVP operational. Do not combine identity extraction, tenant constraints, subscriptions, API v1, native mobile and infrastructure migration in one release.

## Current highest risks

1. `User` combines provider identity, organization authorization, employment and payroll settings, making multi-organization membership impossible without unsafe duplication.
2. No `organization_id` or composite tenant constraints exist, so venue permission checks cannot guarantee tenant isolation.
3. `backend/app/database.py::init_db` and `backend/app/main.py` mutate schema/data at startup, including a hardcoded owner bootstrap.
4. Tenant checks are distributed across large routers; IDs are often loaded before scope is evaluated.
5. Existing tests are dominated by source/AST assertions and do not prove PostgreSQL tenant isolation, transaction behavior or migration correctness.
6. Web sessions, Telegram auth and invites attach directly to `User`; invite tokens are plaintext and lack expiry/revocation semantics.
7. Deployment is a Railway-oriented single container without an explicit migration job, readiness revision check or documented restore-tested backup flow.

## Phase 0: freeze decisions and add real integration infrastructure

### Scope

- Approve the domain and migration decisions in these documents.
- Inventory production schema/data and create an anonymized snapshot.
- Add PostgreSQL integration test infrastructure and deterministic two-organization fixtures.
- Add health/readiness contract design and structured request IDs.

### Likely modules

- `tests/integration/`
- test database/container configuration
- CI workflow
- no production domain behavior change

### Database

No production schema changes. Capture schema dump, row counts, financial checksums and a restore-tested backup.

### Compatibility

Complete. Current clients remain untouched.

### Tests and exit criteria

- Current auth/payroll/export tests pass.
- Real PostgreSQL test can create and query fixtures.
- Restore rehearsal succeeds.
- Architecture decisions have owners and unresolved questions are recorded.

### Rollback

Remove test-only infrastructure; production is unchanged.

## Phase 1: authoritative migrations and provider-neutral identity

### Scope

- Configure Alembic and baseline the verified current production schema.
- Add `Account`, `AccountIdentity` and account sessions additively.
- Resolve Telegram Mini App and OIDC identity through one provider-neutral service.
- Preserve current `User` lookup as a compatibility mapping.
- Replace plaintext invite logging immediately; introduce token hashing for newly issued invites where compatibility permits.

### Likely modules

- Alembic configuration and revisions
- `backend/app/identity.py`
- `backend/app/session_service.py`
- focused changes in `backend/app/auth.py`, `backend/app/routers/web_auth.py`, `backend/app/bot.py`
- schemas for account/session responses

### Database

Add global identity/session tables. Backfill Telegram identities and account mappings. Do not remove `User.telegram_id` yet.

### Compatibility

Both existing auth flows return the same current user experience. Existing web cookies and Mini App headers remain accepted.

### Tests and exit criteria

- Telegram identity maps uniquely to one account.
- Missing/invalid provider data cannot create identity.
- Session revocation works.
- No raw identity token, init data or invite token is logged.
- Legacy login contract remains green.

### Rollback

Revert application to direct user auth; additive account tables remain.

## Phase 2: organization, membership and employee profile split

### Scope

- Add legacy organization, membership and employee profile models.
- Preserve `User.id` as membership ID.
- Split access role from job role and payroll profile.
- Replace startup owner/default-venue mutation with an explicit, idempotent bootstrap command.
- Add `RequestContext` in compatibility mode bound to the legacy organization.

### Likely modules

- `backend/app/organization_context.py`
- `backend/app/membership_service.py`
- `backend/app/bootstrap.py` command
- additive models/schemas
- compatibility adapters around current user responses

### Database

Add organizations, memberships, employee profiles and invites. Backfill accounts/memberships/profiles and reconciliation mapping.

### Compatibility

Current API still exposes the existing `UserOut` shape. Writes dual-write current user fields and new profile/membership fields.

### Tests and exit criteria

- User field mapping is exact for every pay model and role.
- Existing UUID references remain valid.
- Startup is read-only with respect to roles/users.
- One full compatibility test suite has zero old/new projection mismatches.

### Rollback

Return reads to `users`; keep additive data for reconciliation.

## Phase 3: tenant columns, scoped services and constraints

### Scope

- Add and backfill organization ownership on every tenant table.
- Introduce scoped repositories/services whose first argument is organization ID.
- Migrate router queries in bounded groups: venues/team, shifts/adjustments, payroll/payments, audit/exports/AI.
- Add composite foreign keys and tenant-leading indexes.
- Keep venue permissions inside organization context.

### Likely modules

- `backend/app/tenant_queries.py` or domain repositories
- scoped services for shifts, team, payroll, audit and reports
- current routers changed to call scoped services, not duplicated logic
- Alembic revisions for backfill/index/constraints

### Database

Follow `DATABASE_MIGRATION_SEQUENCE.md`: nullable shadow columns, backfill, verification, indexes, `NOT VALID` composite constraints, validation, then `NOT NULL`.

### Compatibility

Legacy `/api` routes are automatically bound to the one migrated organization. Response contracts and payroll formulas stay unchanged.

### Tests and exit criteria

- Full two-organization matrix passes on PostgreSQL.
- Direct cross-tenant inserts fail at database level.
- Financial checksum and source-link counts match exactly.
- No production query path accesses tenant data without context.

### Rollback

Revert application to compatibility reads while retaining populated columns. Drop only a newly blocking constraint if required.

## Phase 4: subscriptions, trials and platform administration

### Scope

- Add organization subscriptions, billing transactions and entitlement service.
- Start 14-day trial for new organizations.
- Support audited 30-day manual pilot activation.
- Enforce central read-only/suspended write gates.
- Add isolated platform API and audit; no impersonation.

### Likely modules

- `backend/app/subscriptions.py`
- `backend/app/entitlements.py`
- provider adapter interface
- `backend/app/routers/platform_v1.py`
- organization billing endpoints/schemas

### Database

Add subscription, billing, platform role/audit and idempotency tables. Backfill legacy organization to an explicit active/manual pilot state.

### Compatibility

Current organization remains writable. Clients may initially receive entitlement fields without new billing UI.

### Tests and exit criteria

- State-machine and time-bound transitions pass.
- Read-only blocks all domain mutations centrally while reads/exports remain correct.
- Provider events are idempotent.
- Platform admins do not gain organization data access.

### Rollback

Feature-disable commercial write gating while preserving billing/audit history.

## Phase 5: API v1 and organization-aware web/Mini App

### Scope

- Add `/api/v1/organizations/{slug}` using the same scoped services.
- Standardize error envelope, pagination, idempotency and OpenAPI schemas.
- Generate TypeScript clients.
- Migrate web-admin URLs and calls first.
- Add Mini App organization selection and organization-bound invite acceptance.
- Keep legacy routes as measured adapters.

### Likely modules

- `backend/app/routers/v1/`
- v1 schemas and OpenAPI CI check
- generated clients in frontend packages
- web-admin active organization route/context
- Mini App membership chooser and launch hint handling

### Database

Add idempotency records and any organization preference fields. No payroll data transformation.

### Compatibility

Old clients continue through legacy adapters. Multi-membership accounts use v1; legacy route must not guess between organizations.

### Tests and exit criteria

- Contract tests for old and v1 routes pass against the same data.
- Two tabs can use different organizations safely.
- Multi-membership Mini App selection is explicit and server-verified.
- OpenAPI has no unapproved breaking change.

### Rollback

Route clients back to legacy adapters for single-organization accounts; leave v1 additive.

## Phase 6: native mobile readiness and session hardening

### Scope

- Add short-lived bearer access tokens and rotating refresh sessions.
- Add per-device session revocation and optional device registration for notifications.
- Require idempotency on retry-prone financial and onboarding writes.
- Build native clients exclusively against v1.

### Likely modules

- mobile auth/refresh router and session service
- device registration service
- generated mobile API client
- secure-storage integration in the native application

### Database

Add refresh family/reuse detection and device registration fields/tables. All organization references remain explicit.

### Compatibility

Browser cookie and Mini App launch flows remain supported. Organization scope is identical across all clients.

### Tests and exit criteria

- Refresh rotation/reuse/revocation tests pass.
- Lost-device session can be revoked without disabling other sessions.
- Native core workflows pass the same cross-tenant suite.
- No mobile-only payroll formula or duplicate business service exists.

### Rollback

Disable native token issuance; web and Mini App sessions remain operational.

## Phase 7: Timeweb production deployment and legacy retirement

### Scope

- Build a provider-neutral deployment with application, PostgreSQL/managed DB, TLS reverse proxy and backup job.
- Add one-off migration release command, live/readiness health checks and migration revision verification.
- Replace Railway-specific domain discovery with explicit public URL settings.
- Rehearse Telegram webhook cutover and rollback.
- Retire legacy routes/columns only after adoption and a complete payroll cycle.

### Likely modules/configuration

- Docker Compose or Timeweb deployment manifests
- Caddy/Nginx configuration
- health endpoints
- backup/restore scripts and runbook
- provider-neutral URL configuration

### Database

Restore or replicate into managed/dedicated PostgreSQL, run versioned migrations once, validate row counts and financial checksums. Database storage is never inside the application container.

### Compatibility

Use a short maintenance/read-only window if required. Keep Railway rollback available until Telegram webhook, auth and smoke tests pass on Timeweb.

### Tests and exit criteria

- Backup restore drill passes.
- Readiness checks database connectivity and expected revision.
- Telegram Mini App, OIDC web login, shifts, payroll, exports and bot webhook pass smoke tests.
- Monitoring and alerting cover errors, backup age and migration state.
- At least one payroll cycle has zero compatibility mismatches before destructive cleanup.

### Rollback

Restore DNS/webhook to Railway and use the pre-cutover database recovery plan. Never run two writable primaries.

## Work that should not be combined with these phases

- A full frontend redesign.
- Payroll formula changes.
- Automatic bank payments.
- Complex accounting or tax functionality.
- Google/Apple/phone login before provider-neutral Telegram identity is stable.
- PostgreSQL RLS before application scoping and connection context are proven.
- Splitting the monolith into microservices.
- Destructive legacy-column removal before measured client cutover.

## First ten implementation tasks

1. Add real PostgreSQL integration test harness and two-organization fixtures.
2. Inventory and restore-test production database; publish verified schema report.
3. Configure Alembic baseline and migration CI.
4. Add Account/AccountIdentity and provider-neutral Telegram resolver additively.
5. Add Organization/Membership/EmployeeProfile and migrate current `User` responsibilities.
6. Remove startup schema/data mutation in favor of migration and bootstrap commands.
7. Add organization shadow columns and deterministic backfills.
8. Introduce central RequestContext and migrate all tenant queries to scoped services.
9. Add composite tenant constraints and pass the cross-tenant security suite.
10. Add subscription/entitlement state machine, then begin API v1 client migration.

## Foundation complete when

- One account can safely hold memberships in multiple organizations.
- Every tenant row and relationship has enforced organization ownership.
- Current Mini App and web-admin payroll results are unchanged.
- Subscription state centrally controls writes without deleting data.
- Platform administration is separate and audited.
- API v1 supports explicit organization context and refreshable mobile sessions.
- Migrations, backups, readiness and Timeweb deployment are repeatable and rollback-tested.
