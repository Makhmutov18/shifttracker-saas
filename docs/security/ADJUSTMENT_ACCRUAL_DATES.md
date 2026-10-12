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

Historical backfill is an explicit authorized operation. The Mini App management section now includes a monthly review list with an inline date editor. Do not directly update dates in production SQL or cancel paid history to force a backfill.

## Management review

`GET /api/admin/adjustments` requires `can_manage_adjustments`. Required `month/year` filters refer to the original accrual month, not creation time. The default `undated_only=true` shows legacy records without dates; `false` includes dated records. The response contains `items`, `total`, `page` and `per_page` (default 20, maximum 100) with stable newest-first ordering.

Owner/admin can optionally select a venue or review all venues. Other authorized managers are limited to their own assigned venue; asking for another venue, or having no assigned venue, returns `403`. Attribution is always `Adjustment.venue_id`, not the employee's current home venue. Archived venues and employees remain available for historical review. The personal `GET /api/adjustments` remains self-only and its response contract is unchanged.

Each management item includes employee/venue/creator names and `date_editable`. Any reservation by a draft, finalized or paid run disables the date action. Cancelled reservations do not block it. This flag is informational, not authorization: the existing PATCH still locks and rechecks the source when saving, including when a run was created after the list loaded.

The Mini App review is mounted only within the permission-gated management section. It has month/venue filters, undated/all selection, pagination and loading/error/empty/success states. Undated records open with an empty date field, constrained to the original month. Failed saves keep the form and entered date; successful saves reload the list. Nothing is backfilled in bulk. Employee screens, payroll formulas, snapshots and payment records are unchanged.

## Rollout and limits

Apply `20261012_add_adjustment_accrual_date.sql` (also present in runtime compatibility SQL), then deploy backend before the Mini App. Existing values remain `NULL`. Retain the additive column on application rollback; do not erase dates or alter snapshots. No production rollout is performed by this change.

The monthly summary/export filters continue to use `month/year`. Negative net accrual handling, automatic carryover, retroactive snapshot correction and automatic adjustment selection are separate product decisions, not part of this change.

PostgreSQL regression tests cover half-month boundary selection, preview/create agreement, duplicate protection, legacy full-month compatibility, partial/cross-month refusal, venue scope, authorization, immutable active sources, audit history, concurrency and idempotent schema compatibility.
