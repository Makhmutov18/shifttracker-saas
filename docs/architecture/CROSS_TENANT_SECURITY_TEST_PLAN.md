# Cross-tenant security test plan

## Purpose

Prove that organization isolation is enforced by authentication context, application queries, authorization rules and database constraints. These tests are release gates, not optional unit coverage.

## Required test environment

Use real PostgreSQL in integration tests. SQLite and source/AST assertions cannot validate composite foreign keys, row locks, transaction isolation or production query behavior.

Create deterministic fixtures:

- `account_owner_a`: owner of Organization A only;
- `account_admin_a`: admin of A only;
- `account_manager_a`: scoped permissions in A;
- `account_employee_a`: member of A;
- `account_owner_b`: owner of Organization B only;
- `account_shared`: member of A and admin of B;
- `account_platform`: platform administrator with no organization membership;
- one suspended account and one suspended membership;
- at least two venues, employees, shifts, adjustments, payroll runs/items/payments, audit events and invites per organization;
- duplicate-looking names and amounts across tenants to expose accidental name-based joins;
- cross-venue shifts inside A, never cross-organization shifts.

Every test asserts response data and database side effects. List endpoints must assert the complete returned ID set, not only absence of one known foreign row.

## Authentication and context matrix

| Case | Expected result |
|---|---|
| Missing authentication on organization route | `401` |
| Valid account without membership in requested slug | `404` |
| Suspended global account | `403` for every organization |
| Active account with suspended A membership | `403` in A, unaffected active B membership still works |
| Shared account selects A | A membership permissions and data only |
| Shared account selects B in another tab/session | B context only; A request remains A |
| Slug changed to foreign organization | `404`, no foreign metadata |
| Forged `organization_id` query/header | Ignored or rejected; path context remains authoritative |
| Start/deep-link organization hint without membership | No access granted |
| Session last-organization hint is stale | Server resolves live membership, never trusts hint |

Repeat relevant cases for Telegram Mini App session, web cookie/CSRF and native bearer/refresh flows.

## Endpoint isolation matrix

For each tenant resource family, test list, detail, create, update, delete/archive and action endpoints where applicable:

- venues;
- memberships/employees and permission changes;
- shifts, approve and reject;
- adjustments;
- expenses;
- payroll preview, run create/read/finalize/cancel;
- payroll payment recording;
- payroll source links;
- personal payroll history;
- audit logs and personal audit;
- XLSX/CSV exports and signed download links;
- AI summary inputs/results;
- invites;
- subscription/billing read and management actions.

Minimum assertions for every family:

1. Owner/admin A can access allowed A rows.
2. Employee A receives the existing permission denial for protected A operations.
3. Any A actor receives `404` for B object IDs, including IDs placed in nested request bodies.
4. A list/filter/export scoped to A contains zero B rows.
5. Creating an A row with a B venue, employee, run, item or source ID fails and leaves no partial rows.
6. Updating an A row cannot re-parent it to B.
7. Search, sorting, pagination and aggregate totals do not count B rows.

## Payroll-specific isolation

Payroll is the highest-risk boundary because it combines employee, venue, adjustments and immutable snapshots.

Test:

- preview for A uses only A approved shifts and A adjustments;
- B pending/rejected/approved shifts never affect A counts or totals;
- A cross-venue work within A is included according to current rules;
- home venue and actual work venue remain distinct;
- a payroll run in A cannot contain a B membership item;
- source-link insertion rejects a B shift or adjustment at the database level;
- duplicate-source protection is organization-aware and cancelled-run semantics remain unchanged;
- payment recording locks and updates only the A item/run;
- foreign run or item IDs return `404` and do not reveal status/amount;
- personal payroll returns only the authenticated membership's finalized/paid snapshots in the selected organization;
- export totals and sheet rows contain only the effective organization/venue scope;
- signed export token cannot be modified to select B and cannot be replayed as another account.

All financial assertions use `Shift.salary_earned` and stored payroll snapshots, not current employee rates.

## Invite and identity isolation

- Invite tokens are stored hashed and are not present in logs or API list responses.
- An A invite can create/activate membership only in A.
- Supplying B venue/profile defaults to A invite creation fails.
- Expired, revoked and already-used invites cannot create a second membership.
- Concurrent acceptance creates exactly one membership.
- An account already in A gets an idempotent/conflict result, never a duplicate.
- Telegram identity already attached to another account cannot be reassigned by accepting an invite.
- Similar names or avatars never trigger account merge.
- A user may accept a valid B invite while retaining A membership; roles and permissions remain independent.

## Permission and subscription composition

For owner, admin, manager and member roles, test effective permissions in each subscription state:

| Subscription state | Reads | Business writes | Billing recovery |
|---|---:|---:|---:|
| `trialing` | allowed | by membership permission | owner/billing permission |
| `active` | allowed | by membership permission | owner/billing permission |
| `grace` | allowed | by membership permission | owner/billing permission |
| `read_only` | allowed | denied centrally | owner/billing permission |
| `suspended` | policy-limited/denied | denied | platform action only |
| `cancelled` | retention policy reads only | denied | explicit reactivation flow |

Verify that:

- frontend-hidden actions remain blocked directly by API;
- view-only payroll permission cannot finalize/cancel/pay;
- organization owner cannot bypass a platform suspension;
- platform admin does not inherit organization-owner access;
- platform subscription actions require a reason and create platform audit records;
- read-only denials return the standard error code and leave no side effects.

## Database constraint tests

Attempt direct inserts/updates that bypass services and assert database rejection for:

- shift organization different from employee or venue organization;
- employee profile home venue in another organization;
- adjustment/expense actor or venue mismatch;
- payroll item/payment/source organization different from parent run;
- invite default venue or creator membership mismatch;
- duplicate `(organization_id, account_id)` membership;
- duplicate `(provider, provider_subject)` identity;
- organization-scoped idempotency key reused with a different request fingerprint.

Also test transaction rollback: induce a failure after parent creation and confirm no partial run, item, payment, invite or audit side effect remains.

## Audit and privacy tests

- General audit for A contains only A events.
- Personal audit contains only events related to the selected membership and its shifts in A.
- IDs of B actors/targets do not appear through old/new values, labels, export, error messages or pagination counts.
- Organization actions include actor account, actor membership and organization IDs.
- Platform actions are written to the separate platform audit stream.
- Secrets and credentials are redacted: init data, auth code/state, cookies, identity tokens, invite tokens, refresh tokens and signed download tokens.

## Concurrency and replay tests

- Two simultaneous payroll payments cannot exceed remaining amount.
- Two simultaneous payroll-run creations cannot claim the same active source.
- Two invite acceptance requests create one membership.
- Replayed provider billing event changes state once.
- Reused write idempotency key returns the original result; changed payload returns `409`.
- Membership suspension during an in-flight request is handled according to transaction boundary and is effective on the next request.
- Organization switch in one browser tab does not mutate another tab's request scope.

## Migration and compatibility tests

Run the full isolation suite against:

1. a clean v1 database;
2. an anonymized legacy snapshot after migration;
3. the dual-write compatibility phase;
4. legacy `/api` adapters bound to the default organization;
5. v1 explicit organization routes.

Compare pre/post migration payroll and shift aggregates. Repeated application startup must not rewrite roles, ownership or subscription state.

## CI and release gates

CI should include:

- fast unit tests for permission and entitlement policy;
- PostgreSQL integration suite with two organizations;
- Alembic clean install and legacy upgrade tests;
- OpenAPI breaking-change check;
- static checks for unscoped tenant repository methods;
- targeted concurrency tests;
- export content and signed-link isolation tests.

A release is blocked by:

- any foreign tenant ID in a response, aggregate, error or log;
- any tenant write path without central context;
- any missing composite constraint planned for that phase;
- any payroll aggregate mismatch;
- failed legacy compatibility contract tests;
- untested rollback or unverified backup restore.
