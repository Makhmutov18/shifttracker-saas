# Web Admin Auth Plan

## Текущее безопасное поведение

Web-admin поддерживает два пути: внутри Telegram использует `initData` и заголовок `X-Init-Data`, а в обычном браузере использует Telegram OpenID Connect Authorization Code Flow + PKCE. В production вне этих путей вход закрыт. `VITE_TELEGRAM_INIT_DATA` разрешён только в dev-mode и не является production bypass.

OAuth tokens, raw session token, initData и персональные данные не сохраняются в `localStorage` и не выводятся в лог. В базе хранится только SHA-256 hash session token.

## Реализованный web-login

1. Пользователь открывает `/admin/` и нажимает «Войти через Telegram».
2. Backend создаёт state, nonce и PKCE verifier в короткоживущей подписанной HttpOnly cookie.
3. Telegram callback проверяет state, обменивает code server-side и валидирует id_token по Telegram JWKS.
4. Backend находит существующего активного User и проверяет административный доступ.
5. Создаётся WebSession; raw token хранится только в HttpOnly cookie, а в БД — только hash.
6. Изменяющие cookie-запросы защищены CSRF token; роли, permissions и venue scope проверяются текущими backend dependencies.

## Требования перед production

- включить все OIDC env и проверить Redirect URI;
- включить HTTPS, чтобы Secure cookie работала;
- добавить rate limit на выпуск и обмен кодов;
- явный logout и отзыв сессий;
- аудит входов без сохранения токенов;
- отдельный security review с учётом 152-ФЗ.

Telegram Mini App auth через `X-Init-Data` остаётся отдельным и совместимым flow.
