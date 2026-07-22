# Multitenancy and identity

## Status

Architecture decision record for the post-MVP foundation. This document describes a staged migration; it does not authorize a big-bang rewrite or a production schema change by itself.

## Current state confirmed in code

The application is functionally single-tenant. There is no organization boundary in the database or request context.

- `backend/app/models.py`: `User` combines Telegram identity, organization access, employee profile, home venue, permissions and payroll settings.
- `Venue` has no organization owner. Most business tables therefore cannot express or enforce tenant ownership.
- `backend/app/auth.py::authenticate_request` resolves a Telegram identity directly to `User.telegram_id`; web sessions also belong directly to `User`.
- `backend/app/routers/web_auth.py::telegram_login_callback` performs the same direct identity-to-user lookup.
- `backend/app/bot.py::cmd_start` accepts a plaintext `User.invite_token` and attaches Telegram identity to that user row.
- `backend/app/routers/admin.py` lists users and venues globally and `_get_venue_or_404` cannot apply an organization boundary.
- `backend/app/api.py` contains venue-based visibility helpers such as `_payroll_run_is_visible`, but venue scope is not a tenant boundary.
- `backend/app/main.py` bootstraps a hardcoded owner and default venue during startup.

The current venue semantics are valid and must survive migration:

- `User.venue_id` is the employee's home venue.
- `Shift.venue_id` is the venue where the work actually happened.
- A cross-venue shift remains part of that employee's accruals and belongs to the actual work venue for operational reporting.

## Target domain model

### Global identity

#### Account

A human or service identity independent of any organization.

Core fields:

- `id: UUID`
- `display_name: string`
- `status: active | suspended | deleted`
- `locale`, `timezone` nullable
- `created_at`, `updated_at`

An account may belong to several organizations. Suspending an account is a platform-level action and is different from suspending one membership.

#### AccountIdentity

A verified sign-in method attached to an account.

Core fields:

- `id: UUID`
- `account_id: UUID`
- `provider: telegram | email | phone | apple | google`
- `provider_subject: string`
- normalized verified metadata, including an optional avatar URL
- `verified_at`, `created_at`, `updated_at`

Required constraint: unique `(provider, provider_subject)`. Telegram numeric IDs are stored as provider subjects, not as organization membership fields. Raw provider tokens and raw OIDC claims must never be persisted.

#### Session

A global account session, independent of active organization.

Core fields:

- `id: UUID`
- `account_id: UUID`
- hashed access/session and refresh credentials as applicable
- `client_type: web | mini_app | mobile`
- minimal device metadata
- `expires_at`, `last_used_at`, `revoked_at`, `created_at`

An optional `last_organization_id` may be a convenience hint. It is never an authorization grant.

### Tenant ownership

#### Organization

The hard tenant boundary.

Core fields:

- `id: UUID`
- `name: string`
- `slug: string`, globally unique and mutable through a controlled flow
- `timezone: string`
- `status: active | read_only | suspended | closed`
- `created_by_account_id`
- `created_at`, `updated_at`

#### OrganizationMembership

An account's access to one organization.

Core fields:

- `id: UUID`
- `organization_id`
- `account_id`
- `access_role: owner | admin | manager | member`
- `permissions: JSON`
- `status: invited | active | suspended | left`
- `joined_at`, `created_at`, `updated_at`

Required constraints:

- unique `(organization_id, account_id)`
- unique `(organization_id, id)` for composite tenant foreign keys
- at least one active owner enforced by the service transaction and covered by regression tests

`access_role` answers only what the person may do in an organization. It must not describe their job or compensation.

#### EmployeeProfile

Employment and payroll attributes within one organization.

Core fields:

- `organization_id`
- `membership_id`, unique within the organization
- `position`
- `job_role: senior | barista | cook | senior_cook | other`, nullable
- `home_venue_id`
- `pay_model: hourly | fixed_shift | revenue | hybrid`
- `hourly_rate`
- `fixed_shift_rate`
- `revenue_percentage`
- `employment_status: active | archived`
- `created_at`, `updated_at`

The formulas remain unchanged. The new `fixed_shift_rate` only makes the existing overloaded use of `User.hourly_rate` explicit after a compatibility backfill.

#### Invite

An expiring, revocable invitation to one organization.

Core fields:

- `id`, `organization_id`
- `token_hash`, unique; the plaintext token is shown once and never stored
- intended `access_role` and permissions
- optional employee profile defaults and `home_venue_id`
- `expires_at`, `revoked_at`
- `accepted_by_account_id`, `accepted_at`
- `created_by_membership_id`, `created_at`

The bot deep link is only a transport for the opaque token. Acceptance must authenticate the account, verify the organization-bound invite in one transaction and enforce membership uniqueness.

## Exact migration of current User responsibilities

The safest compatibility strategy preserves each current `User.id` as the new `OrganizationMembership.id`. Existing business foreign keys can then continue to reference the same UUID while account identity is introduced separately.

| Current `User` field | Target owner | Migration rule |
|---|---|---|
| `id` | `OrganizationMembership.id` | Preserve exactly. Create a separate new `Account.id`. |
| `telegram_id` | `AccountIdentity.provider_subject` | Provider `telegram`, decimal value serialized as a string. |
| `telegram_photo_url` | verified identity/account metadata | Copy only after the existing URL normalization rules. |
| `name` | `Account.display_name` | Copy initially. A membership-specific display override may be added later only if needed. |
| `position` | `EmployeeProfile.position` | Copy as-is. |
| `role` | membership access role plus employee job role | Split according to the mapping below. |
| `venue_id` | `EmployeeProfile.home_venue_id` | Preserve home-venue meaning. |
| `hourly_rate` | `EmployeeProfile.hourly_rate` or `fixed_shift_rate` | For `fixed_shift`, backfill fixed rate from this field; otherwise preserve hourly value. |
| `revenue_percentage` | `EmployeeProfile.revenue_percentage` | Copy as-is. |
| `permissions` | `OrganizationMembership.permissions` | Copy effective overrides without broadening access. |
| `pay_model` | `EmployeeProfile.pay_model` | Copy as-is. |
| `is_active` | membership and employment statuses | `false` becomes suspended/archived inside this organization, not a global account ban. |
| `invite_token` | `Invite` | Replace with hashed, expiring invitation records; never retain plaintext after migration. |

Access-role mapping:

- `owner -> owner`
- `admin -> admin`
- `senior -> manager`
- `barista`, `cook`, `senior_cook -> member`

The original operational role remains in `EmployeeProfile.job_role`. During migration, copy the current effective permission set so a senior employee does not silently lose or gain capabilities.

Rows without Telegram identity require two paths:

1. Unclaimed placeholder with no history: convert to an `Invite`; create no account until acceptance.
2. Placeholder referenced by shifts, adjustments or payroll snapshots: create a provisional account without a login identity, preserve membership/profile IDs and reconcile only after verified invite acceptance.

Never merge accounts automatically by name.

## Tenant-scoped tables

Add a direct, non-null `organization_id` to every tenant business, snapshot and link table, including rows where the organization is derivable:

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
- `organization_memberships`
- `employee_profiles`
- `invites`
- `organization_subscriptions`
- `billing_transactions`
- future `organization_settings`, `idempotency_records`, and `device_registrations`

Accounts, account identities and sessions are global and must not have tenant ownership. Platform audit records are global but may reference a target organization.

Direct organization keys are intentionally redundant. They allow:

- every query and index to begin with `organization_id`;
- composite foreign keys such as `(organization_id, venue_id)` and `(organization_id, payroll_run_id)`;
- database rejection of otherwise valid cross-tenant relationships;
- simpler forensic and export queries.

Each tenant parent receives unique `(organization_id, id)`. Child references use composite foreign keys. Application checks are still required, but they are not the only protection.

## Active organization selection

New API routes use explicit path context:

`/api/v1/organizations/{organization_slug}/...`

The slug selects a tenant; it never grants access. A central request dependency performs this sequence:

1. authenticate the global account;
2. resolve an active membership by `(account_id, organization_slug)`;
3. load organization status and subscription;
4. calculate effective permissions and entitlements;
5. expose a `RequestContext(account, organization, membership, permissions, entitlements, request_id)`.

This is preferred to an organization header, a long-lived token claim or a mutable session-only organization because it is explicit in logs and links, works in concurrent browser tabs and remains stateless for mobile clients.

Client behavior:

- Web admin URLs become `/admin/o/{organization_slug}/...` and call the same path-scoped API.
- Telegram Mini App automatically selects the sole active membership. With several memberships it shows an organization chooser. A Telegram start parameter may suggest an organization but the server still validates membership.
- Future native clients use a global account access token with organization-scoped paths.
- Existing `/api` routes remain compatibility adapters during migration and bind only to the legacy default organization or the account's sole membership. Ambiguous multi-membership access must require migration to `/api/v1`, not guess.

Every resource lookup must include organization scope in the query itself. A resource from another organization returns `404`, not a revealing tenant-existence error.

## Platform administration

Platform administration is not an organization role. Add separate global models:

- `PlatformRoleAssignment(account_id, role, status, created_at)`
- `PlatformAuditLog(actor_account_id, action, target_organization_id, old_value, new_value, created_at)`

Platform routes live under `/api/platform/v1`, require platform credentials and audit all changes. A platform admin does not become an organization owner, does not receive silent impersonation and cannot use organization endpoints without a real membership. Any future support impersonation must be explicit, short-lived, visibly marked and separately audited.

## Security invariants

- No tenant query runs without `RequestContext.organization_id`.
- Raw `organization_id`, `venue_id`, membership IDs and payroll IDs from clients are selectors only; scope is revalidated server-side.
- Cross-tenant object IDs return `404`.
- Membership suspension does not globally disable the account; account suspension blocks all memberships.
- Payroll snapshots, `Shift.salary_earned`, actual-work venue and home-venue semantics remain unchanged.
- Invites, sessions and refresh tokens are hashed at rest and expire.
- Logs never include invite tokens, auth codes, Telegram init data, signed download tokens or provider tokens.
- Database composite foreign keys prevent cross-tenant links even if an application check regresses.

## Deferred decisions

- Enterprise SSO and domain discovery.
- Per-organization custom job-role catalogs.
- Organization mergers and data transfers.
- Support impersonation.
- Row-level security. PostgreSQL RLS may become defense-in-depth later, after explicit application scoping and connection-pool context are proven correct.
