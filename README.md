# ShiftTracker SaaS

ShiftTracker is a Telegram Mini App for shift tracking, payroll transparency, bonuses, deductions, and simple operations control for small hospitality teams.

It is aimed at coffee shops, bars, bakeries, and small teams that need a clear way to log shifts, approve hours, and understand payroll without living inside spreadsheets.

## Current status

This repo is a working MVP skeleton.

What already works:

- Telegram Mini App shell with 5 screens: Dashboard, Shift, History, Owner, Profile
- Telegram WebApp initialization and auth wiring
- Shift creation
- Monthly earnings and hours calculation
- Expense tracking
- Owner/admin panels for approvals, adjustments, audit logs, and team edits
- Export to `.xlsx`
- Railway-ready Docker setup for a single container deployment

What is not finished yet:

- No billing system
- No multi-tenant workspace system
- No invite/role system beyond the current staff flow
- No production-grade migration history
- No polished design system
- No advanced payroll rules beyond the current models

## Local setup

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend API at `/api` in development.

## Required environment variables

Backend:

- `DATABASE_URL` - PostgreSQL connection string
- `BOT_TOKEN` - Telegram bot token
- `BOT_USERNAME` - bot username used for invite links
- `WEBAPP_URL` - public Telegram WebApp URL
- `RAILWAY_PUBLIC_DOMAIN` - optional Railway domain override
- `SECRET_KEY` - app secret
- `DEBUG` - enable local debug behavior

## Repository layout

- `backend/` - FastAPI API, models, auth, bot, notifications
- `frontend/` - React + Vite Telegram Mini App
- `Dockerfile` - single-container Railway build
- `railway.json` - Railway deployment config

## API surface

Current backend routes include:

- `GET /api/me`
- `POST /api/shifts`
- `GET /api/shifts`
- `GET /api/shifts/pending`
- `PATCH /api/shifts/{shift_id}`
- `POST /api/expenses`
- `GET /api/expenses`
- `GET /api/stats/monthly`
- `GET /api/audit-logs`
- `POST /api/adjustments`
- `GET /api/adjustments`
- `GET /api/export/xlsx`
- `GET/POST/PATCH/DELETE /api/admin/users...`
- `POST /webhook`

## Notes

- The app is built as a single Telegram staff tool, not a public SaaS yet.
- PostgreSQL is the expected production database.
- The current codebase is enough to test the core shift logging and payroll flow, but it still needs a tighter MVP definition before expanding.
