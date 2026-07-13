# Порядок.Смены — web-admin

Отдельный desktop/tablet frontend для владельцев и управляющих. Мобильный Telegram Mini App в `frontend/` остаётся самостоятельным приложением.

## Запуск

```powershell
cd web-admin
npm install
npm run dev
```

Production build:

```powershell
npm run build
```

## Env

- `VITE_API_BASE_URL` — origin backend, если API расположен на другом домене. При пустом значении запросы идут на текущий origin.
- `VITE_TELEGRAM_INIT_DATA` — только для локальной разработки (`import.meta.env.DEV`). В production переменная не используется как bypass.

Пример находится в `.env.example`. Реальные initData и секреты нельзя коммитить или логировать.

## Auth

Внутри Telegram используется `window.Telegram.WebApp.initData`. В production вне Telegram приложение показывает закрытый экран и не выполняет API-запросы. Будущий самостоятельный web-login описан в [`../WEB_ADMIN_AUTH_PLAN.md`](../WEB_ADMIN_AUTH_PLAN.md).

## Структура

- `src/api.ts` — типизированный API client и обработка HTTP-ошибок;
- `src/auth.ts` — Telegram/dev auth-adapter;
- `src/components/` — shell и переиспользуемые UI-компоненты;
- `src/pages/` — Overview, Shifts, Payroll, Employees, Venues, Audit;
- `src/styles.css` — light/dark tokens и responsive layout.

## Используемые endpoints

- `GET /api/me`
- `GET /api/shifts`, `PATCH /api/shifts/{id}`
- `GET /api/payroll/summary`
- `GET /api/payroll-runs/preview`
- `POST /api/payroll-runs`
- `GET /api/payroll-runs`, `GET /api/payroll-runs/{id}`
- `POST /api/payroll-runs/{id}/finalize`
- `POST /api/payroll-runs/{id}/cancel`
- `POST /api/payroll-runs/{id}/payments`
- `GET/POST/PATCH/DELETE /api/admin/users`
- `GET/POST/PATCH/DELETE /api/admin/venues`
- `GET /api/audit-logs`

Известные ограничения перечислены в [`../WEB_ADMIN_GAPS.md`](../WEB_ADMIN_GAPS.md).
