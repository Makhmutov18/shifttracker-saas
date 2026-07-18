# ShiftTracker AI Rules

## Project
This repository is shifttracker-saas, a Telegram Mini App for shift tracking, approvals, payroll and team management.

## Do not touch other projects
Never modify:
- trud-miniapp
- supply-club-kazan-landing
- parent repository files outside shifttracker-saas

## Safety rules
Do not commit:
- .env
- secrets
- database dumps
- backups
- sql dump files
- local logs with credentials

## Current stable flows
Do not break:
- employee creates shift
- duplicate shift protection
- pending / approved / rejected statuses
- payroll counts only approved shifts
- payroll export includes only approved shifts
- permissions system
- Telegram auth

## Permissions
Permissions already exist.
Do not refactor permissions unless the task explicitly asks for it.
Owner always has full access.

## Venue scoping invariant

- `User.venue_id` is the employee's home organizational venue.
- `Shift.venue_id` is the actual venue where the shift was worked.
- Team assignment and employee lists are scoped by `User.venue_id`.
- Venue shifts, hours, revenue and shift accruals are scoped by `Shift.venue_id`.
- Personal employee accruals include their shifts across all venues.
- `Adjustment.venue_id` is the venue whose accruals include that adjustment.
- Never filter venue work with `Shift.venue_id == venue OR User.venue_id == venue`.
- In Russian UI, use `Основная точка` for an employee and `Точка смены` for work.

## Revenue invariant

- `Shift.revenue` is the revenue of one shift and is used only by revenue/hybrid salary formulas and shift details.
- `Shift.revenue` is not the complete venue revenue for a reporting period and must not be summed to calculate the venue payroll share.
- `PayrollRun.revenue_total` is the actual revenue entered for one concrete venue and the same saved payroll period.
- A payroll run with `revenue_total` must have a concrete `venue_id`; all-points runs cannot store one combined revenue value.
- Payroll share is calculated as `PayrollRun.total_amount / PayrollRun.revenue_total * 100` and is unavailable when revenue is missing or not positive.
- `revenue_total` is management-only data, does not change employee accruals and is immutable after the payroll run leaves `draft`.
- Employee-facing API and UI must not expose `revenue_total` or payroll share.

## AI invariant

- AI is read-only.
- Backend computes every financial and operational metric.
- AI may explain aggregates but may not calculate payroll.
- AI output never changes shifts, adjustments, payroll runs or payments.
- No Telegram IDs, contacts, employee names, comments or secrets are sent to the provider.
- Provider keys exist only in backend environment variables.
- AI requests are user initiated.
- Employee-facing screens do not expose management AI summaries.
- AI text is rendered as plain text, never HTML.
- Provider failure must not affect non-AI application flows.
- AI recommendations are advisory and must not be presented as verified facts.
- The provider is configurable through `AI_PROVIDER` and `AI_MODEL`.
- Never hardcode the production API key.

AI deployment variables:

- required to enable the feature: `AI_FEATURE_ENABLED`, `AI_PROVIDER`, `AI_MODEL`, `DEEPSEEK_API_KEY`;
- optional tuning: `DEEPSEEK_BASE_URL`, `AI_REQUEST_TIMEOUT_SECONDS`, `AI_MAX_OUTPUT_TOKENS`.

Do not add production values to the repository. Missing AI configuration must disable only the AI endpoint and must not block application startup.

## UI
The app supports light/dark/system theme.
Use CSS variables for colors.
Avoid emoji in product UI.
Prefer lucide line-icons.
Avoid heavy borders and cheap Bootstrap-like cards.
Use neutral surfaces, soft shadows and clear spacing.
Any UI or design change must be checked in both light and dark themes.
Do not use hardcoded colors when existing CSS variables or surface classes can be reused.
Keep Telegram Mini App bottom nav safe area in mind when adjusting spacing and lists.
Before any UI/UX, frontend redesign, or web-admin task, read `UX_UI_DESIGN_RULES.md`.

## Checks
For frontend-only tasks:
cd frontend && npm run build

For backend changes:
python -m compileall backend/app

## Git
Before commit:
git status --short

Commit only relevant files.
Push to main only after checks pass.
