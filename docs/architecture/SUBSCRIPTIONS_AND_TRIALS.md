# Subscriptions and trials

## Goal

Add organization-level commercial access without coupling payroll data to one payment provider and without deleting customer data when a trial or subscription ends.

## Ownership and entities

### OrganizationSubscription

One current subscription belongs to one organization.

Recommended fields:

- `id`, `organization_id`
- `plan_code` such as `trial`, `pilot`, `standard`
- `provider: internal | manual | yookassa | telegram_stars | app_store | google_play`
- `status: trialing | active | grace | read_only | suspended | cancelled`
- `trial_started_at`, `trial_ends_at`
- `current_period_start`, `current_period_end`
- `grace_ends_at`
- `cancel_at_period_end`
- `provider_customer_id`, `provider_subscription_id`, nullable
- `status_reason`, nullable
- `created_at`, `updated_at`

Provider identifiers are references, not authority. The local subscription state is updated only by verified provider events or audited platform actions.

### BillingTransaction

Immutable commercial event history.

Recommended fields:

- `id`, `organization_id`, `subscription_id`
- `provider`
- `provider_event_id`, unique per provider
- `kind: invoice | payment | refund | adjustment | renewal`
- `status: pending | succeeded | failed | refunded`
- `amount`, `currency`
- `occurred_at`, `received_at`
- minimal normalized metadata JSON

Webhook payloads may be retained only if policy requires it and secrets are redacted. Processing must be idempotent by provider event ID.

### Entitlement result

Do not persist an entitlement row for every permission in the first implementation. A central service derives effective capabilities from plan, subscription status, membership role and permission overrides:

- `can_read`
- `can_write`
- `can_manage_team`
- `can_run_payroll`
- `can_export_payroll`
- `can_manage_billing`

Endpoint authorization combines membership permission and subscription entitlement. Frontend visibility is convenience only.

## State machine

```text
organization created
        |
        v
   trialing (14 days)
      |       |
 payment     expires
      v       v
    active -> grace -> read_only
      |          ^         |
 cancel at      |       payment
 period end ----+---------+

platform suspension: any writable state -> suspended
platform restore: suspended -> previous valid commercial state
closure: read_only -> cancelled
```

Allowed transitions:

| From | Event | To | Notes |
|---|---|---|---|
| none | organization created | `trialing` | Fourteen calendar days in organization timezone, stored as UTC instants. |
| `trialing` | verified payment/manual pilot activation | `active` | Start a new paid period. |
| `trialing` | trial expires | `grace` or `read_only` | Grace is used only when `grace_ends_at` is configured. |
| `active` | renewal succeeds | `active` | Advance period idempotently. |
| `active` | payment fails or period expires | `grace` | Preserve writes during a short recovery window. |
| `active` | `cancel_at_period_end` reaches end | `read_only` | No immediate data loss. |
| `grace` | payment succeeds | `active` | Restore writes immediately. |
| `grace` | grace expires | `read_only` | Block business writes. |
| `read_only` | payment/manual activation | `active` | Existing data becomes writable again. |
| any writable state | audited platform suspension | `suspended` | Security/legal override, not a billing failure. |
| `suspended` | audited platform restore | prior valid state | Recalculate time-based state first. |
| `read_only` | explicit organization closure | `cancelled` | Retain data according to retention policy. |

State changes are compare-and-set transactions with an audit record. Scheduled reconciliation handles missed webhooks and time-based transitions.

## MVP commercial policy

- New organization: 14-day trial, no card required.
- Pilot customer: platform operator can activate a 30-day `pilot` period with provider `manual`.
- Trial and paid access grant the same product capabilities initially; plan limits may be introduced later.
- Grace period is configurable, recommended three days for paid subscriptions and zero for trials.
- Expiration produces read-only access, not deletion.
- Only an owner or a membership with explicit `can_manage_billing` may view billing actions.
- Employees never manage the organization's subscription.

## Read-only semantics

Allowed:

- sign in and select organization;
- view shifts, employees, venues, payroll snapshots and payment history;
- export existing data if membership permission allows it;
- view subscription state and start a renewal/payment flow;
- leave the organization or revoke own sessions.

Blocked:

- create or edit shifts, adjustments, employees and venues;
- approve/reject shifts;
- create/finalize/cancel payroll runs or record payments;
- create invites;
- change organization settings unrelated to billing.

The entitlement dependency returns a stable machine error, for example `subscription_read_only`, with HTTP `403`. It must not be scattered as ad hoc status checks in routers.

## Provider neutrality and idempotency

- The domain service accepts normalized events such as `payment_succeeded`, `renewal_failed`, and `subscription_cancelled`.
- Provider adapters verify signatures and translate payloads; they do not directly edit organization access.
- `provider_event_id` is unique and processed once.
- Outbound payment/session creation accepts an idempotency key scoped to organization and operation.
- Mobile store receipts and Telegram Stars are additional adapters, not new subscription models.
- Amounts and currency are recorded on billing transactions; payroll money is a separate domain and is never reused for billing.

## Platform administration

Platform operators may:

- inspect subscription status and transition history;
- activate or extend a manual pilot;
- suspend or restore an organization;
- retry reconciliation.

Every action requires a reason and writes `PlatformAuditLog`. Platform administrators do not gain employee, payroll or owner permissions inside the organization and cannot silently impersonate users.

## UI contract

Clients receive a compact organization access object:

```json
{
  "status": "grace",
  "plan_code": "standard",
  "current_period_end": "2026-08-01T00:00:00Z",
  "grace_ends_at": "2026-08-04T00:00:00Z",
  "capabilities": {
    "can_read": true,
    "can_write": true,
    "can_manage_billing": true
  }
}
```

Clients use capabilities to present actions, while the server repeats the check. They must not infer paid access from dates alone.

## Security and operational requirements

- Store all transition timestamps in UTC and evaluate organization-local calendar rules explicitly.
- Never accept plan, amount, organization or entitlement claims from an unsigned client payload.
- Never delete tenant data automatically on expiration.
- Alert on failed webhook verification, repeated reconciliation failures and inconsistent provider/local state.
- Back up subscription and billing history with tenant data.
- Cover concurrent payment/webhook races with unique constraints and row locks.

## Out of scope for the foundation

- Complex per-seat billing.
- Usage metering.
- Automatic tax documents.
- Proration between multiple paid plans.
- Bank integration for employee payroll.
