# Authentication hardening

## Telegram webhook

Startup registers `secret_token` with Telegram. `/webhook` checks the matching
`X-Telegram-Bot-Api-Secret-Token` header before parsing or dispatching updates.
The secret is an HMAC-SHA256 value derived from `BOT_TOKEN` with the fixed
`shifttracker:telegram-webhook:v1` domain separator. It is stable across replicas;
no additional production variable is required. Rotating `BOT_TOKEN` also rotates
the webhook secret. Never log either value.

Missing or invalid credentials return 403. An unavailable dispatcher returns 503;
processing failures return a generic 500 so Telegram can retry. Update payloads
and exception contents are not included in responses or application logs.

During deployment, startup must successfully re-register the webhook before the
new instance receives traffic. A rollback to code without the header check
reopens the original vulnerability. Do not delete the webhook during shutdown.

## Mini App freshness and web CSRF

`X-Init-Data` keeps the existing Telegram HMAC verification and additionally
requires a numeric `auth_date`. Default validity is 24 hours, including a maximum
30-second future clock skew. `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` can shorten the
validity window (60 to 86400 seconds). Expired data returns 401; reopen the Mini
App in Telegram to obtain fresh data. The server clock must be synchronized.
Duplicate query fields and an unconfigured bot token are rejected.

Cookie-authenticated mutations require the explicit `X-CSRF-Token` header. The
CSRF cookie alone does not authorize a mutation. The existing web-admin request
helper already copies the cookie value into this header. Safe read methods and
Telegram header authentication keep their separate existing behavior.

## Explicit owner bootstrap

Application startup no longer creates a hardcoded owner, promotes an existing
user, or reactivates a disabled account. Existing database compatibility SQL is
unchanged. For a new installation use the existing explicit command:

```powershell
python scripts/db/bootstrap_admin.py
```

Supply `DATABASE_URL` and `BOOTSTRAP_TELEGRAM_ID` securely through the environment.
Optional `BOOTSTRAP_NAME` and `BOOTSTRAP_VENUE_NAME` control initial labels.
Run this administrative command intentionally, not as part of every deployment:
it can promote and reactivate an existing account. Do not run it against
production as part of local tests. Invite tokens are no longer logged on creation.

## Verification boundary

`tests/test_auth_security.py` exercises real auth functions and the ASGI webhook
with mocked database results and bot dispatch. No production database, Telegram
network call, or AI provider is used. PostgreSQL integration tests and a controlled
deployment smoke test remain separate release gates.

Run the local suite with an explicit project root to disambiguate the root and
backend `tests` packages:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -t . -q
.\.venv\Scripts\python.exe -m compileall backend/app
git diff --check
```

## Next independent fixes

This change does not complete the security or architecture roadmap. Next:

1. Prove the PostgreSQL integration baseline in an isolated test database.
2. Serialize payroll source reservation and cancellation/payment transitions.
3. Decide partial-period adjustment attribution and negative accrual handling
   before changing any payroll rule.
4. Correct report revenue semantics and the admin summary's treatment of
   cancelled/draft runs without altering salary formulas.

Keep these changes on the existing architecture feature branch until reviewed.
No production rollout or merge to `main` is part of this hardening stage.

## Shift authorization follow-up

`PATCH /api/shifts/{id}` checks requested fields before mutating the shift:

- `can_approve_shifts` is required for status updates, including a resent status.
- `can_edit_team_shifts` is required for time, revenue, cashier hours, venue and
  standalone comment changes.
- An approver may attach a review comment when moving a pending shift to approved
  or rejected, without gaining general editing rights.
- Requests mixing allowed and forbidden changes are rejected as a whole.
- Non-owner/admin users cannot read or mutate another actual work venue's shifts,
  or move a pending shift outside their venue. Existing pending-only venue editing
  and active-venue validation remain in place.
- `can_view_team_shifts` now correctly grants venue-scoped team history, not just
  personal history. Ordinary employees retain personal cross-venue history.

Both clients separate edit and approval controls. Saving edits no longer resends
the current status in web-admin. Mini App Dashboard gets its current-month pending
count from the existing pending-shifts endpoint, so approvers do not need payroll
view permission. No financial formula, role default or permission key is changed.
The web-admin permission helper now honors explicit admin denials and senior
defaults, matching the existing backend and Mini App behavior.

`tests/test_shift_permissions.py` exercises real ASGI routes with mocked storage,
including inspection of the generated SQL scope. This is not a PostgreSQL
integration test. Client permission defaults and overrides are tested without a
browser or new dependency:

```powershell
cd web-admin
node --test tests/permissions.test.mjs
```

References: [Telegram webhook secret](https://core.telegram.org/bots/api#setwebhook),
[Mini App validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
