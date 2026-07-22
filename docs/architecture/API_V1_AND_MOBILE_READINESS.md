# API v1 and mobile readiness

## Current constraints

The current clients share a route set rooted at `/api`:

- `frontend/src/utils/api.ts` sends Telegram `X-Init-Data` and has no organization context.
- `web-admin/src/api.ts` uses a web session plus CSRF, with Telegram init data as a compatibility path.
- `backend/app/auth.py` resolves authentication directly to a `User` row.
- `web-admin/src/App.tsx` stores only a venue filter. A venue is currently both home context and the closest available scope selector.
- Router functions mix authentication, permission checks, venue scoping, queries and response shaping.

API v1 must introduce organization context without breaking the working Mini App or web-admin during migration.

## Route structure

Global identity routes:

```text
/api/v1/auth/telegram/mini-app
/api/v1/auth/telegram/oidc/start
/api/v1/auth/telegram/oidc/callback
/api/v1/auth/refresh
/api/v1/auth/logout
/api/v1/me
/api/v1/me/organizations
/api/v1/me/sessions
```

Organization routes:

```text
/api/v1/organizations/{organization_slug}/context
/api/v1/organizations/{organization_slug}/venues
/api/v1/organizations/{organization_slug}/memberships
/api/v1/organizations/{organization_slug}/shifts
/api/v1/organizations/{organization_slug}/adjustments
/api/v1/organizations/{organization_slug}/payroll-runs
/api/v1/organizations/{organization_slug}/audit
/api/v1/organizations/{organization_slug}/exports
/api/v1/organizations/{organization_slug}/subscription
```

Platform administration is isolated under `/api/platform/v1` and uses a separate authorization dependency.

## Request context

All organization endpoints depend on one context resolver. It must:

1. validate the account session or bearer token;
2. resolve the requested organization by slug;
3. query an active membership for that account and organization;
4. load organization and subscription state;
5. calculate effective permissions and entitlements;
6. attach a request ID and structured audit context.

Suggested value object:

```python
RequestContext(
    account,
    organization,
    membership,
    permissions,
    entitlements,
    request_id,
)
```

Routers accept this object and tenant-scoped services require `organization_id` as their first identifier. A service must not offer an unscoped `get_by_id(id)` for tenant data.

## Authentication by client

### Telegram Mini App

- Keep Telegram init-data validation as the primary launch credential during compatibility migration.
- Enforce Telegram signature and a bounded `auth_date` age.
- Resolve or create `AccountIdentity(provider=telegram)` only through verified init data.
- Exchange init data for a short application session when v1 is enabled; do not send init data in download URLs or logs.
- If the account has one active membership, select it automatically. If it has several, return the list and require a choice.

### Web admin

- Keep secure, HTTP-only, same-site cookies and CSRF for browser mutations.
- Move `WebSession.user_id` semantics to global `Session.account_id`.
- Organization comes from the route, not the cookie.
- OIDC state, nonce, PKCE, issuer, audience and expiry checks remain mandatory.

### Native mobile

- Use short-lived access tokens and rotating refresh sessions tied to `Account`.
- Store refresh credentials in the platform secure store.
- Revoke sessions per device and rotate on use; detect refresh-token reuse.
- The access token identifies the account, not an active organization. Organization scope remains in the request path and is verified against live membership.

No provider access token or Telegram ID token becomes an application access token.

## Consistent HTTP contract

Use a versioned error envelope:

```json
{
  "error": {
    "code": "subscription_read_only",
    "message": "Организация доступна только для просмотра",
    "request_id": "...",
    "details": {}
  }
}
```

Status rules:

- `400`: malformed business input;
- `401`: missing or invalid account authentication;
- `403`: authenticated but permission/entitlement denies the operation;
- `404`: resource absent or outside the active organization;
- `409`: valid request conflicts with current state;
- `422`: field validation;
- `429`: rate limit;
- `503`: temporary dependency failure.

Do not expose whether an object exists in another tenant.

Responses use UTC ISO-8601 timestamps and decimal money serialized consistently. Cursor pagination is preferred for growing event lists; existing page-number endpoints may remain during compatibility.

## Write safety and idempotency

Require `Idempotency-Key` for externally retried operations:

- invite acceptance;
- payroll run creation/finalization;
- payroll payment recording;
- report-download link creation where client retries can be ambiguous;
- subscription checkout and provider event handling.

Store an organization-scoped hash of key, actor account, method, route, request fingerprint, response status/body hash and expiry. A reused key with different input returns `409`.

Optimistic concurrency should use `updated_at` or a version field for editable resources. Financial state transitions continue to use database transactions, row locking and snapshot values.

## API schema and generated clients

- Separate Pydantic request/read schemas from SQLAlchemy models.
- Define stable v1 names that do not expose transitional `User` internals.
- Publish OpenAPI in CI and detect breaking schema changes.
- Generate TypeScript types/client bindings for Mini App and web-admin from the same OpenAPI document.
- A future native client consumes the same v1 contract rather than a mobile-specific duplicate API.
- Keep server-calculated payroll fields read-only in every client schema.

## Invites, links and notifications

Organization invites use opaque, expiring tokens. Telegram start parameters, web links and future universal links carry only that token or a short server-side reference. The acceptance endpoint:

1. authenticates the account;
2. hashes and resolves the token;
3. verifies expiry/revocation and organization status;
4. creates membership/profile in one transaction;
5. marks the invite accepted idempotently.

Future mobile device registrations are organization-scoped only for notification preferences; the device identity belongs to the account. Notifications must not include sensitive payroll data on lock screens by default.

## Compatibility plan

1. Keep current `/api` routes and response types unchanged while the new schema is additive.
2. Add account/membership resolution behind current authentication, binding legacy traffic to the migrated default organization.
3. Implement `/api/v1` organization context and migrate web-admin first, because its URL can carry the organization slug explicitly.
4. Migrate Mini App after organization selection and invite flow exist.
5. Introduce native mobile against v1 only.
6. Measure legacy route use and remove adapters only after all supported clients are beyond the cutoff version.

Compatibility routes must call the same tenant-scoped services as v1. They must not preserve an unscoped second implementation.

## Observability and rate limits

Structured logs include request ID, route template, account ID, organization ID and membership ID, but never auth credentials, invite tokens, signed download tokens, raw Telegram payloads or payroll export contents.

Track:

- authentication and refresh failures by reason;
- cross-tenant lookup denials without recording foreign object details;
- subscription write denials;
- idempotency replays/conflicts;
- endpoint latency and database errors;
- webhook/provider reconciliation lag.

Apply rate limits to auth starts/callbacks, invite acceptance, exports, AI summaries and billing endpoints. Limits should key on account and organization where authenticated, with IP fallback before authentication.

## Definition of mobile-ready v1

- Account sessions are independent of organization membership.
- Every tenant route has explicit and centrally verified organization context.
- OpenAPI and generated clients are versioned in CI.
- Refresh rotation, session revocation and idempotency are covered by integration tests.
- Core read/write workflows have no browser-cookie-only assumption.
- Existing web and Mini App clients continue to function through scoped compatibility adapters.
