# AI Handoff

## Project Identity

- Product: `Порядок.Смены`
- Format: Telegram Mini App for shifts, employees, venues and payroll in coffee shops and small hospitality teams
- Repo: `shifttracker-saas`

## Current Priorities

- `31 July 2026` - MVP freeze
- `10 August 2026` - pilot in a live coffee shop
- `31 August 2026` - packaging and sales materials
- `15 September 2026` - first commercial launch

## Must-Read

- [AI_RULES.md](AI_RULES.md)
- [ROADMAP_TO_LAUNCH.md](ROADMAP_TO_LAUNCH.md)
- [SMOKE_TESTS.md](SMOKE_TESTS.md)
- [MVP_RELEASE_CHECKLIST.md](MVP_RELEASE_CHECKLIST.md)
- [UX_UI_DESIGN_RULES.md](UX_UI_DESIGN_RULES.md) - обязательный документ перед frontend/UI/web-admin задачами

## Current Product State

- shifts can be created
- approve / reject exists
- employees and venues exist
- permissions exist
- history and payroll exist
- ErrorBoundary is added
- onboarding checklist is temporarily disabled after the blank screen regression

## Known Issues / Frozen Tasks

- XLSX export does not block the pilot
- web admin is planned later
- AI / DeepSeek is later-stage work
- automatic payments are later; first sales can be manual

## Hard Rules

- do not change backend / API without a clear reason
- do not touch payroll formulas unless explicitly asked
- do not break permissions
- keep UI strings in Russian
- check light and dark themes for UI changes
- do not use hardcoded colors when CSS variables or surface classes exist
- after changes, run the relevant build or compile step
- always commit and push to `main`

## Venue Scoping Invariant

- `User.venue_id` is the employee's home venue; use it for team assignment.
- `Shift.venue_id` is the actual work venue; use it for shifts, hours, revenue and venue accruals.
- Personal employee accruals include all of their venues.
- `Adjustment.venue_id` identifies the venue of the bonus or deduction.
- Never broaden a venue filter with `Shift.venue_id == venue OR User.venue_id == venue`.
- UI labels: `Основная точка` for employee assignment, `Точка смены` for actual work.

## Standard Finish

- run `git status --short`
- commit relevant files only
- push with `git push origin main`
- report commit hash and push result
