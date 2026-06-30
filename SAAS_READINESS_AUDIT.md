# SaaS Readiness Audit: ShiftTracker

## 1. Current state

Сейчас `shifttracker-saas` уже выглядит как ранний vertical MVP, а не как пустой шаблон.

В проекте уже есть:

- backend на FastAPI;
- frontend на React + Vite;
- Telegram WebApp auth;
- сущности пользователей, смен, точек, бонусов/списаний, журнала изменений;
- mobile-first интерфейс;
- owner/admin flow;
- экспорт payroll в XLSX;
- Railway-ready Docker deployment.

По сути это не готовый production SaaS, а хороший пилот для одного бизнеса или нескольких близких точек с ручным операционным контуром.

## 2. What is already reusable

Повторно использовать в будущем можно:

- модель `users`;
- модель `venues`;
- модель `shifts`;
- модель `adjustments`;
- модель `audit_logs`;
- Telegram WebApp auth flow;
- invite-token механику;
- payroll export;
- mobile navigation и role-based UI sections;
- логику расчета смен и прозрачного отображения заработка.

Это уже сильная основа именно для модуля `Shifts & Payroll`.

## 3. What is missing for MVP

Для более уверенного SaaS/MVP уровня пока не хватает:

- нормального README и явной документации по запуску;
- явного разделения owner/admin/senior policy на backend и frontend без расхождений;
- понятной модели нескольких точек и владения ими;
- стабильной migration discipline вместо runtime schema patching;
- тестов на payroll и permission-critical сценарии;
- более явного payroll period model;
- истории изменений, доступной сотруднику по своим правкам в удобном виде;
- более аккуратного invite/onboarding flow.

## 4. What is hardcoded / risky

Главные жесткие места:

- в `backend/app/main.py` зашит `ADMIN_TELEGRAM_ID`;
- там же создается дефолтная точка через hardcoded bootstrap;
- `DATABASE_URL` по умолчанию направлен на локальный Postgres;
- `SECRET_KEY` имеет небезопасный дефолт `change-me-in-production`;
- invite token печатается в backend logs;
- часть эволюции схемы делается raw SQL внутри `init_db()`, а не через Alembic migrations;
- проект пока предполагает почти single-tenant мышление, хотя выглядит как будущий SaaS.

Это не блокирует пилот, но мешает безопасно расти.

## 5. Auth and roles readiness

Сильные стороны:

- есть Telegram-based auth;
- пользователь ищется по `telegram_id`;
- роли уже заведены;
- mutating admin scenarios уже отделены от employee flows.

Слабые места:

- auth фактически проверяет, что Telegram user существует в локальной базе, но не дает полноценной workspace/org модели;
- `senior` в UI местами трактуется как почти admin, а backend policy строже;
- нет отдельного permission map как явного слоя;
- invite flow и role onboarding пока больше tactical, чем productized.

Вывод: auth и roles достаточно для пилота, но еще не готовы как shared SaaS core.

## 6. Database readiness

Текущая база отражает MVP-домен неплохо:

- `venues`
- `users`
- `shifts`
- `expenses`
- `audit_logs`
- `adjustments`

Но есть системный риск:

- используется `create_all`;
- затем поверх него накатываются runtime SQL patch-операции;
- Alembic формально присутствует, но как основной migration-путь не оформлен.

Это значит:

- schema drift со временем почти гарантирован;
- воспроизводимость staging/prod/local будет слабеть;
- сложные изменения станут дорогими.

Дополнительно:

- `Expense` по названию читается как операционный расход, хотя в продукте больше похож на employee-side удержание/траты;
- `status` в `Shift` хранится строкой, при этом код местами обращается к нему как к enum-like value.

## 7. UI/UX readiness

Интерфейс уже ориентирован на реальное использование:

- есть dashboard;
- есть форма смены;
- есть история;
- есть профиль;
- есть owner/admin panel.

Что хорошо:

- мобильная структура;
- роли читаются на уровне навигации;
- продукт сфокусирован на job-to-be-done, а не на абстрактной админке.

Что еще сыровато:

- owner panel объединяет слишком много разных сценариев в один экран;
- нет достаточно явной продуктовой рамки для владельца сети против владельца одной точки;
- язык интерфейса и терминология стоит довести до более консистентного operational style;
- UX еще похож на ранний tool, а не на вылизанный коммерческий SaaS.

## 8. Deployment readiness

Плюсы:

- есть Dockerfile;
- есть Railway config;
- frontend build встроен в контейнер;
- backend умеет раздавать собранный frontend.

Риски:

- нет README c понятным deploy/run workflow;
- локальный запуск завязан на локальный Postgres;
- env contract не описан как продуктовая документация;
- нет явного smoke-check workflow внутри самого репозитория.

Вывод: deploy на Railway реалистичен, но операционная готовность проекта пока держится на знании автора, а не на документации.

## 9. Recommended safe implementation order

Без большого refactor безопасный порядок такой:

1. Зафиксировать продуктовую рамку и MVP scope в документации.
2. Добавить README с честным статусом проекта и локальным/dev/deploy запуском.
3. Убрать hardcoded bootstrap-зависимости в env или admin setup flow.
4. Нормализовать permissions matrix для `owner`, `admin`, `senior`, `barista`, `cook`.
5. Перевести schema changes на Alembic как единственный источник истины.
6. Добавить минимальные integration checks на auth, create shift, approve shift, adjustment, export.
7. Только потом думать про multi-location и shared core.

## Итог

`shifttracker-saas` уже выглядит как сильный пилот модуля `Shifts & Payroll`.

Главная ценность проекта уже понятна: прозрачные смены и понятные деньги для команды.

Главный риск тоже понятен: проект быстрее вырос в полезный рабочий инструмент, чем в аккуратно оформленный SaaS foundation.

Это нормально для пилота. Следующий шаг - не большой refactor, а последовательная стабилизация продукта, ролей, документации и migration discipline.
