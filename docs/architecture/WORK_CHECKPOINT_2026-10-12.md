# Work checkpoint: 12 October 2026

## Resume point

- Branch: `feature/multitenant-phase-0`.
- HEAD: `9c13c72cacf4a86cde0bfb3b083239a105c5d8e5` (`attribute payroll adjustments by explicit accrual date`). The local branch matches its remote tracking branch.
- This work has not been merged into main or deployed to production.
- The latest completed change is documented in `docs/security/ADJUSTMENT_ACCRUAL_DATES.md`.
- The owner explicitly approved using an accrual date for bonuses/deductions. Existing undated records must not be dated silently from `created_at`.
- New Mini App adjustments submit an explicit date. Preview/create select dated adjustments by inclusive period boundaries. Undated legacy adjustments require full coverage of their recorded month; partial coverage is rejected rather than silently omitting or duplicating them.
- An authorized accrual-date PATCH exists for unused adjustments. Active payroll source reservations and saved snapshots remain protected.
- A team-wide legacy-adjustment review/dating screen is not implemented yet. This was the next proposed implementation step; do not weaken the personal adjustments endpoint to build it.

## Last completed verification

Recorded from the preceding implementation stage, not rerun for this checkpoint:

- Root unit tests: 202 passed.
- PostgreSQL integration tests: 64 passed on each of two runs.
- Existing client Node tests: 29 passed.
- Mini App production build and TypeScript check passed.
- Backend compilation and `git diff --check` passed.
- No browser QA was performed. The disposable test PostgreSQL instance was stopped.

Preserve unrelated untracked `.mimocode/`, `tmp/` and landing experiment files. They are not part of payroll work.

## New product discussion (not implementation approval)

The owner paused implementation to discuss differing salary models, employment/accounting arrangements, payment methods and schedules.

Two concrete schedule examples:

| Inclusive accrual period | Schedule A | Schedule B |
| --- | --- | --- |
| Days 1-15 of a month | Day 20 of the same month | Day 25 of the same month |
| Day 16 through month end | Day 5 of the next month | Day 10 of the next month |

Keep these concepts separate in the proposed product model:

1. Accrual rules determine earned amounts. Preserve saved historical shift earnings and current payroll formulas.
2. Period rules select sources; schedule rules map each period to a planned payment date, including a month offset and real month end.
3. Payroll runs/items save calculation snapshots. A scheduled date must not automatically approve shifts, finalize runs or mark money paid.
4. Payroll payments record actual full/partial payments with their actual dates and methods. Cash/bank is a payment method, not a legal-employment classification.
5. Statutory payroll, gross/net wages, taxes and employment compliance need a separate explicitly scoped accounting design. Do not introduce white/gray/black salary modes or pretend that a payment method proves compliance.

`PayrollScheduleSettings` is existing data-model groundwork, not an implemented automatic scheduling feature. Manual periods must remain available. If schedules are introduced, settings changes must not silently move historical saved obligations.

An advance that is actual money already paid should be represented as a payment against an obligation, not also subtracted as a deduction. Historical adjustments labelled as advances must not be reclassified automatically; any reconciliation needs explicit rules and protection against double counting.

Potential sequence for discussion: legacy accrual-date review, simple twice-monthly schedule plus planned due date, then richer payment-method/accounting support only if real users need it. No application code, schema, API or deployment changes are authorized by this discussion alone.

## Subsequent implementation authorization

The owner subsequently approved continuing, with management controls kept out of ordinary employee screens. The next increment implements the legacy-adjustment review: a scoped management-only paginated GET and a Mini App inline editor that calls the existing protected date PATCH. See `docs/security/ADJUSTMENT_ACCRUAL_DATES.md` for the current contract. The preceding resume point records the state before this increment.

The next separate increment remains the simple twice-monthly schedule and a saved planned payment date. It is not implemented by the adjustment-review change. Keep work on the current feature branch; no production rollout or merge to main is performed here.

Verification for the adjustment-review increment: 202 root unit tests, 84 PostgreSQL integration tests and 38 client Node tests passed. Mini App build, TypeScript check, backend compilation and diff checks passed. The first sandbox build failed with Windows `EPERM`; the build passed outside sandbox. The disposable PostgreSQL process also needed to run outside sandbox. One new test fixture was corrected to avoid persisting an impossible NULL home venue; application schema constraints were not changed. Browser/Telegram visual QA was not performed.

## Completed schedule increment: 13 October 2026

The subsequent approval to continue covers the first schedule increment, now implemented after adjustment-review commit `a8638b14197a2faaafd4efa093dbb47256d13fef`. Work remains on `feature/multitenant-phase-0`; main and production are unchanged. Earlier resume points above are historical, not the current implementation state.

- Per-venue manual/twice-monthly settings reuse `PayrollScheduleSettings`. Existing payroll access gates reads; only owner/admin with payroll access may save. First saves serialize on the venue row and settings/audit history commit together.
- Calendar suggestions cover inclusive 1-15 and 16-month-end periods, including 20/5 and 25/10 schedules, leap years and year rollover. Holidays are handled manually, not inferred.
- Payroll runs accept an optional explicit `planned_payment_date` and return that saved date in management and personal history. Existing rows remain NULL. Old clients omitting the field remain manual even if a schedule exists. Settings edits never move saved dates or change financial snapshots.
- The Mini App management payroll form exposes settings and period suggestions. Employees see only a conditional planned-date line in their own Payouts history, not extra management controls.
- No automatic creation/finalization/payment, tax accounting, employment classification, employee overrides or workspace inheritance was added. Existing accrual formulas, source reservations and actual payments remain unchanged.
- The additive migration is `backend/app/migrations/20261012_add_planned_payment_date.sql`; deploy schema/backend before clients when rollout is explicitly approved. No production migration or deployment was performed here.

Verification: 209 root unit tests, 102 PostgreSQL integration tests and 44 client Node tests passed. Final Mini App build, TypeScript check, backend compilation and diff checks passed. Browser/Telegram QA was not performed. PostgreSQL tests use only the disposable local test database. Preserve the unrelated untracked files listed above.

See `docs/architecture/PAYROLL_SCHEDULES.md` for contracts and boundaries. A separate next increment may expose the same schedule/planned-date workflow in web-admin; do not duplicate calendar calculations in the client. Holiday calendars, reminders and statutory payroll remain separately scoped future work.

## Completed web-admin follow-up: 13 October 2026

Following schedule commit `1de1037a62b65894981f6ba95b50bf15c9b5caa8`, the owner requested continuation. The web-admin payroll creation drawer now uses the existing schedule GET/PUT for a concrete globally selected venue and sends the optional explicit planned date on the existing payroll-run POST. Owner/admin can configure days or keep manual periods. Read-only viewers see only saved dates in list/cards/details; ordinary employee screens are unchanged.

Backend-generated period suggestions are reused without client calendar calculations. Manual period/venue changes invalidate preview and suggested dates. Creation rejects a mismatched preview or a planned date before period end. Late preview responses from another context are ignored; rapid save/create requests are guarded. Errors keep settings/creation open, and actual payment recording and historical financial snapshots are untouched.

Verification: all 57 client Node tests passed (13 new web-admin schedule/create/API cases). Web-admin TypeScript/production build and diff checks passed. Backend and Mini App code were not changed or rebuilt for this frontend-only increment. Browser QA, dev servers and screenshots were not run. Work stays on `feature/multitenant-phase-0`, with no main merge or production deployment. Existing unrelated untracked files remain untouched.

## Payroll workflow regression checkpoint: 13 October 2026

After `e3c785002eaf76d06567f60a164014a797c4d6fc`, the owner approved the proposed end-to-end verification step. Ten new real PostgreSQL/ASGI scenarios cover four pay models with both requested schedules, shift submission/approval, dated corrections on 15/16 boundaries, two successive half-month snapshots, cross-venue isolation, expense exclusion, partial/full payments, retries and source reuse after cancellation. Auth identity is supplied by existing test fixtures, not by a live Telegram login; only the shift submission clock is frozen. No application-code fix was needed for these scenarios.

Verification: 209 root unit tests, 112 PostgreSQL integration tests and 57 client Node tests passed. Both Mini App and web-admin builds, backend compilation and diff checks passed. The workflow subset was rerun after strengthening the next-month approved-shift boundary assertion. The disposable local PostgreSQL instance is stopped after testing; no production data or deployment was touched.

See `docs/runbooks/PAYROLL_RELEASE_GATE.md` for tested boundaries and rollout prerequisites. Browser/Telegram QA was not performed: no explicit `VISUAL_QA_REQUIRED` was supplied. Staging auth/webhook checks, production inventory, verified backup restore and explicit merge/deploy approval are still required. Local green tests are not evidence that the whole feature branch is production-ready or multi-tenant. Keep the current feature branch and unrelated untracked files intact.

## Local visual QA follow-up: 14 October 2026

The owner explicitly approved `VISUAL_QA_REQUIRED`. Using application baseline `a5150a9b16680836440dbf51a46e0029956c3f46`, the local pass checked web-admin payroll creation/settings, saved dates and read-only visibility at 1440/390/360 px, plus Mini App management schedule/preview and personal history at 390/360 px in light/dark themes. Fixtures simulate API responses; no real login, database, payment, Telegram notification or AI call was involved.

Two user-visible defects were confirmed and fixed narrowly in web-admin: existing payroll-source 409 messages appeared in English, and success toast notifications obscured drawer footer actions. Only the two known source-conflict messages are translated; unrelated server details remain unchanged. Payroll toasts move above an active action footer; other screens and permission behavior are unchanged.

The targeted correction check confirmed no toast/footer intersection at 1440/390/360 px and verified the Russian conflict message. Schedule selection fills the planned date, failed save/preview/create keeps the working context, successful creation opens saved details, read-only users have no creation/settings controls, and employee history has planned/actual dates plus readable empty/error states. No horizontal overflow, framework overlay or page JavaScript exception was observed in checked states. Intentional 403/409/422/503 fixtures produced expected HTTP console errors, not runtime failures. The last management card was above the dock at scroll end in the narrow light-theme check.

Verification: 61 client Node tests passed (four new response-error regression cases), both production builds passed, and diff checks passed. Backend tests were not rerun for these frontend-only fixes; the prior 209/112 results above are historical. Browser-plugin was unavailable; bundled Playwright used the already installed Chromium 1228 after its default 1234 executable was missing. No browser/dependency download was performed. Two harness locator corrections were needed, not application fixes.

Screenshots and temporary fixture/harness files are outside the repository in `%TEMP%\shifttracker-payroll-qa-20261014`. Representative evidence: `web-conflict-fixed-dark-1440.png`, `web-details-fixed-dark-1440.png`, `web-details-fixed-light-390.png`, `mini-schedule-light-390.png`, `mini-history-light-390.png`. The localhost server/browser were stopped. This is local Chromium fixture QA, not real Telegram/iOS safe-area or staging validation. Production backup/restore, staging auth/webhook checks and explicit merge/deployment approval remain open. Main and production were not touched.
