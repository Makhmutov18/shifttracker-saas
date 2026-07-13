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

Внутри Telegram используется `window.Telegram.WebApp.initData`. В обычном браузере кнопка «Войти через Telegram» запускает backend OIDC Authorization Code Flow + PKCE. После успешного callback backend устанавливает HttpOnly web-session cookie. В production токены не сохраняются в браузере и не проходят через frontend. Подробности — в [`../WEB_ADMIN_AUTH_PLAN.md`](../WEB_ADMIN_AUTH_PLAN.md).

## Настройка Telegram OIDC

В BotFather/панели Telegram Login зарегистрируйте:

- Allowed origin: `https://your-app.railway.app`;
- Redirect URI: `https://your-app.railway.app/api/web-auth/telegram/callback`;
- Client ID и Client Secret положите только в Railway Variables.

Backend env:

```text
TELEGRAM_OIDC_CLIENT_ID=
TELEGRAM_OIDC_CLIENT_SECRET=
TELEGRAM_OIDC_REDIRECT_URI=https://your-app.railway.app/api/web-auth/telegram/callback
WEB_ADMIN_PUBLIC_URL=https://your-app.railway.app
WEB_SESSION_SECRET=длинный-случайный-секрет
WEB_SESSION_DAYS=14
```

После deploy откройте `https://your-app.railway.app/admin/`. `WEB_SESSION_SECRET`, Client Secret и реальные токены нельзя коммитить или логировать.

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
- `GET /api/web-auth/telegram/start`
- `GET /api/web-auth/telegram/callback`
- `GET /api/web-auth/session`
- `POST /api/web-auth/logout`

Известные ограничения перечислены в [`../WEB_ADMIN_GAPS.md`](../WEB_ADMIN_GAPS.md).
