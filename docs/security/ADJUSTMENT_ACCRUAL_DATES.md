# Explicit adjustment accrual dates

## Approved product decision

On 12 October 2026 the owner chose an explicit accrual date for bonuses/deductions in partial-period payroll runs. `created_at` records insertion time and is not an accrual date. No historical dates are inferred automatically.

Previously every partial period touching a month selected all of that month's adjustments. For example, both 1-15 June and 16-30 June selected the same bonus; creating the first run then blocked the second on the source-uniqueness check. That check remains intact.

## New records and calculations

- Nullable `Adjustment.accrual_date` is a calendar date, not a timestamp.
- `POST /api/adjustments` accepts an optional date for backward compatibility. When provided, the existing `month/year` fields derive from that date, preserving monthly summary attribution. Older clients omitting it still create undated records in the current UTC month, as before.
- The Mini App adjustment form explicitly displays a required date, initially the user's local calendar date. The submitted date is not converted to UTC.
- Payroll preview and creation share the same source loader. Dated records are selected by inclusive date boundaries and the existing `Adjustment.venue_id` scope. Shift selection and `calculate_payout_total` are unchanged.
- An undated historical adjustment remains eligible only when the requested period covers its entire recorded month. A partial coverage returns a Russian `422` before saving a run; the adjustment is neither silently omitted nor assigned to the first half.
- Existing payroll snapshots, source links and actual payments are never recalculated or backfilled.

## Dating unused historical records

`PATCH /api/adjustments/{id}/accrual-date` accepts `{ "accrual_date": "2026-06-15" }`.

The existing `can_manage_adjustments` permission and venue scope apply. Missing/inaccessible records return `404`; a date outside the original recorded month returns `422`. Amounts, type, reason, employee, venue and monthly attribution cannot be changed through this endpoint.

Dates cannot change while the adjustment belongs to a `draft`, `finalized` or `paid` run (`409`). A cancelled run no longer reserves it. Updating locks the adjustment row, sharing the creator's source-lock protocol, and writes an `adjustment_date_updated` audit event in the same transaction. Concurrent creation either observes the new date or commits first and blocks the date edit.

Historical backfill is an explicit authorized API operation in this stage; a team-wide review/backfill screen is not yet implemented. Do not directly update dates in production SQL or cancel paid history to force a backfill.

## Rollout and limits

Apply `20261012_add_adjustment_accrual_date.sql` (also present in runtime compatibility SQL), then deploy backend before the Mini App. Existing values remain `NULL`. Retain the additive column on application rollback; do not erase dates or alter snapshots. No production rollout is performed by this change.

The monthly summary/export filters continue to use `month/year`. Negative net accrual handling, automatic carryover, retroactive snapshot correction and automatic adjustment selection are separate product decisions, not part of this change.

PostgreSQL regression tests cover half-month boundary selection, preview/create agreement, duplicate protection, legacy full-month compatibility, partial/cross-month refusal, venue scope, authorization, immutable active sources, audit history, concurrency and idempotent schema compatibility.
