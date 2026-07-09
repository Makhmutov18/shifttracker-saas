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
