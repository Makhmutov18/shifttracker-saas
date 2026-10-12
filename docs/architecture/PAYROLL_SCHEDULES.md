# Initial payroll schedules and planned payment dates

## Product boundary

Accrual formulas, accrual periods, planned due dates and actual payment events are separate concepts. This increment adds calendar suggestions and an optional saved planned payment date. It does not calculate taxes, classify employment arrangements, transfer money, send notifications, auto-approve shifts or create/finalize/pay payroll runs automatically.

The existing `PayrollScheduleSettings` table stores the initial per-venue settings. There is no global NULL-venue setting, workspace inheritance or employee override in this stage. Company/workspace defaults must wait for explicit tenant ownership; do not treat a user's home venue as a workspace ID.

## Modes

- `manual`: preserve arbitrary period selection and optional explicit payment date.
- `twice_monthly`: days 1-15 inclusive, paid on the configured day (16-31) of that month; days 16 through actual month end inclusive, paid on the configured day (1-15) of the following month.
- Examples: 1-15 July -> 20 July; 16-31 July -> 5 August. Configuring 25/10 instead gives 25 July and 10 August.
- February, leap years and December rollover use calendar dates. A configured day absent in the month is clamped to month end.
- This is not a statutory compliance engine. Weekend/holiday adjustments are manual through the explicit planned-date field when creating a run. Percentage advances and holiday calendars are not implemented.

## API and authorization

`GET /api/payroll-schedule?venue_id=...&month=...&year=...` returns settings plus two suggested `periods` for twice-monthly mode. Each period has `period_start`, `period_end` and `planned_payment_date`. A missing setting returns manual mode without inserting a database row. Years are limited to 1-9998 to keep next-year dates representable.

Read access uses existing `can_view_team_payroll`. Owner/admin can read any venue; other authorized viewers can read only their assigned venue. A venue outside their scope returns 404. Ordinary staff cannot read settings, even though their own saved payroll history includes the planned date.

`PUT /api/payroll-schedule?venue_id=...` accepts `schedule_type`, `first_payment_day`, `second_payment_day`. Only owner/admin with payroll access may write. Unknown/inactive venues return 404; invalid modes/days return 422. No permission keys were added.

The venue row is locked before reading/inserting/updating its active setting, serializing concurrent first saves. Updates and audit history commit together. Multiple pre-existing active settings or an unsupported existing schedule type return 409; they are not silently merged or rewritten. Inactive settings remain untouched. NULL-venue groundwork rows are not used.

## Saved calculation date

`PayrollRun.planned_payment_date` is a nullable DATE. `POST /api/payroll-runs` accepts it explicitly; it cannot precede the selected period end. Omitting it keeps legacy/manual behavior, even when a schedule exists. There is no implicit date assignment to an older client or existing run.

The management list/detail and personal history responses include the saved date. Reads never look up current schedule settings to reinterpret it. Subsequent settings edits, finalization, cancellation and actual payments do not change the saved planned date. There is no date-edit endpoint in this increment; confirm the date before creating a draft.

Amounts, source reservations, previews, snapshots, exports and payment idempotency remain unchanged. `PayrollPayment.payment_date` is still the actual payment date, not the planned date. An advance payment must not also be counted as a deduction; historical advance-labelled adjustments are not reclassified by this feature.

## Mini App

The existing management payroll form shows the schedule control only for a selected concrete venue. Owner/admin can expand settings; payroll viewers can use available period suggestions read-only. Selecting a suggested half-month fills the period and planned-date fields and invalidates the previous preview. Manual date/venue changes clear the suggested date and preview, preventing an unrelated date from carrying into another period. The normal preview/create flow still performs the calculation and snapshot save.

The employee's existing Payouts history adds only a conditional `Плановая выплата` line from their own saved run. No settings, team totals or management revenue fields are exposed. Web-admin schedule controls are not added in this increment; older web-admin clients continue creating manual runs with no planned date.

## Rollout and tests

Apply the additive `20261012_add_planned_payment_date.sql` before deploying backend and then clients. Runtime compatibility SQL is idempotent and leaves old rows NULL. Retain the additive column on application rollback. This increment does not deploy to production or merge the architecture feature branch into main.

Tests cover both requested schedules, month end/leap years/year rollover, validation, read/write authorization and scope, manual compatibility, snapshot-date immutability, personal visibility, no automatic payments, concurrent first saves, transactional rollback and idempotent bootstrap. Client handler/API tests run without a browser; they are not Telegram or visual QA.
