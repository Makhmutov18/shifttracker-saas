# Технический аудит Порядок.Смены

Дата аудита: 11 июля 2026 года

Проверенный commit: `d0f1c82` (`add payroll run data models`)

## Резюме

`shifttracker-saas` — не прототип с пустыми экранами, а рабочий vertical MVP Telegram Mini App. Основной контур уже существует: Telegram auth, создание смены, pending/approved/rejected, утверждение, сотрудники, точки, персональная история, team payroll, permissions, темы и Railway deployment.

Текущий код можно довести до пилота без переписывания с нуля. Главный вывод аудита: перед пилотом важнее закрыть несколько узких проблем доступа, startup-совместимости и единого расчёта денег, чем продолжать визуальную полировку или строить будущий SaaS-слой.

Проверки текущего состояния:

- `python -m compileall backend/app` — успешно;
- `npm run build` — успешно, production bundle собран;
- автоматических backend/frontend тестов в репозитории не найдено;
- рабочее дерево до создания этого документа было чистым.

Уровни приоритета:

- `P0` — реальный риск доступа, денег, потери рабочего сценария или production-инцидента;
- `P1` — высокая вероятность ошибки на пилоте или серьёзное ограничение поддержки;
- `P2` — технический долг и локальные дефекты, которые не блокируют пилот;
- `later` — важно для SaaS-масштабирования, но преждевременно для текущего пилота.

## 1. Backend architecture

### P1. Операция может сохраниться, а API вернуть ошибку после audit/notification side effect

- **Участки:** `backend/app/routers/api.py:723-786`, `backend/app/routers/admin.py:157-187`, `backend/app/routers/admin.py:191-234`, `backend/app/routers/admin.py:267-339`, `backend/app/routers/admin.py:375-460`.
- **Проблема:** основная сущность коммитится, затем отдельным коммитом пишется audit log или отправляется уведомление. В shift create/update audit и notification уже защищены, но adjustments и admin CRUD могут упасть после успешного первого commit. Клиент увидит ошибку и при повторе создаст дубль или повторную корректировку.
- **Минимальное исправление:** основную запись и audit log сохранять одной транзакцией; внешнее Telegram-уведомление выполнять после commit в `try/except`, не меняя успешный HTTP-ответ.
- **До пилота:** да, прежде всего для бонусов/удержаний и создания сотрудников.

### P2. Основной API router смешивает слишком много обязанностей

- **Участки:** `backend/app/routers/api.py:1-1312`.
- **Проблема:** в одном файле находятся auth dependency, shifts, payroll, expenses, audit, adjustments, XLSX и reminders. Это повышает риск соседних регрессий и уже привело к дублированным XLSX helpers и устаревшим именам вроде `export_csv`.
- **Минимальное исправление:** после MVP freeze постепенно вынести домены в отдельные routers без изменения URL и бизнес-логики; сначала export и payroll.
- **До пилота:** нет. Большой refactor сейчас опаснее текущего размера файла.

### P2. Bot использует синхронный DB session внутри async webhook и создаёт Bot на каждое уведомление

- **Участки:** `backend/app/bot.py:11-22`, `backend/app/bot.py:37-107`, `backend/app/notifications.py:7-16`.
- **Проблема:** sync SQLAlchemy блокирует event loop во время webhook; каждый notification создаёт новый `Bot` без явного закрытия. На пилотной нагрузке это обычно незаметно, но плохо масштабируется и усложняет диагностику сетевых ошибок.
- **Минимальное исправление:** позже переиспользовать lifecycle Bot instance и async session factory.
- **До пилота:** нет, если нагрузка пилота мала.

## 2. Frontend architecture

### P1. OwnerPanel остаётся главным источником runtime regression

- **Участки:** `frontend/src/pages/OwnerPanel.tsx:1-2229`.
- **Проблема:** один файл содержит tabs, invite, approvals, venues, team, adjustments и audit, много локального состояния и независимых fetch flows. Несколько прошлых blank-screen инцидентов были именно в этой зоне. Production build проверяет типы/синтаксис, но не исполняет все ветки UI.
- **Минимальное исправление:** до пилота не делать большой refactor; добавить targeted smoke/component tests на открытие каждой вкладки. После freeze безопасно выносить по одной вкладке без изменения поведения.
- **До пилота:** тесты — да; структурный refactor — нет.

### P1. Локальный OwnerPanelBoundary остаётся в ошибочном состоянии до перезагрузки

- **Участки:** `frontend/src/pages/OwnerPanel.tsx:81-103`, `frontend/src/pages/OwnerPanel.tsx:438-445`.
- **Проблема:** boundary оборачивает все вкладки одним экземпляром и не сбрасывает `hasError` при смене tab. После одной render-ошибки весь OwnerPanel остаётся закрытым локальным error state.
- **Минимальное исправление:** ключевать boundary по активной вкладке (`key={tab}`) или реализовать контролируемый reset при смене tab.
- **До пилота:** да, это маленькое и безопасное укрепление против повторного blank-screen сценария.

### P2. Ошибки части экранов подавляются без понятного состояния

- **Участки:** `frontend/src/pages/Profile.tsx:103-116`, `frontend/src/pages/OwnerPanel.tsx:2105-2117`, `frontend/src/hooks/useUser.ts:20-23`.
- **Проблема:** Profile делает `Promise.all` и скрывает обе секции, если упал один запрос; AuditTab проглатывает ошибку и показывает пустую историю; `useUser` содержит английский fallback. Это не обязательно вызывает crash, но затрудняет поддержку пилота.
- **Минимальное исправление:** использовать независимые settled results и локальные русские error states.
- **До пилота:** желательно, но не блокирует после закрытия P0.

### P2. Есть неиспользуемый UI-компонент с устаревшими терминами и mojibake

- **Участки:** `frontend/src/components/StatsWidget.tsx:23-57`, `frontend/src/components/StatsWidget.tsx:73`.
- **Проблема:** компонент не импортируется, но содержит видимое слово «Штрафы» и строку `В·`. При случайном повторном использовании дефект вернётся в UI.
- **Минимальное исправление:** удалить dead component либо привести строки к актуальной терминологии и UTF-8.
- **До пилота:** нет.

## 3. Auth и permissions

### P0. Деактивированный пользователь продолжает проходить Telegram auth

- **Участки:** `backend/app/routers/api.py:73-98`, `backend/app/routers/admin.py:110-136`.
- **Проблема:** dependencies находят пользователя по `telegram_id`, но не проверяют `User.is_active`. Архивный сотрудник с прежним initData сохраняет доступ к `/api/me`, своим сменам и другим разрешённым endpoint; архивный manager может сохранить admin-доступ.
- **Минимальное исправление:** единая auth dependency должна отклонять `is_active == false`; admin dependency должна переиспользовать её.
- **До пилота:** обязательно.

### P0. `can_manage_team` позволяет повысить себя или другого пользователя до owner

- **Участки:** `backend/app/routers/admin.py:110-136`, `backend/app/routers/admin.py:267-304`, `backend/app/routers/admin.py:363-443`, `backend/app/schemas.py:48-56`.
- **Проблема:** любой пользователь с `can_manage_team` может напрямую отправить `role=owner/admin`, создать owner или изменить собственную роль. После этого `owner` автоматически получает все permissions. Frontend может скрывать часть опций, но API не защищён от прямого запроса.
- **Минимальное исправление:** только текущий owner может создавать/назначать owner; admin не может повысить себя до owner; delegated manager не может менять role/permissions выше собственного уровня. Сохранить существующую защиту последнего owner/admin.
- **До пилота:** обязательно, особенно если права будут выдавать управляющему.

### P0. Общий audit log доступен любому авторизованному сотруднику точки

- **Участки:** `backend/app/routers/api.py:678-697`.
- **Проблема:** `/api/audit-logs` не проверяет `can_manage_team` или другой admin permission. Скрытие вкладки во frontend не защищает endpoint; сотрудник может получить имена и old/new values действий команды своей точки.
- **Минимальное исправление:** добавить backend permission check; персональный `/api/me/audit-log` оставить отдельным и ограниченным текущим пользователем.
- **До пилота:** обязательно.

### P0. Reminder endpoint публичный и может спамить всех активных пользователей

- **Участки:** `backend/app/routers/api.py:1283-1312`.
- **Проблема:** `POST /api/reminders/shifts` не имеет ни Telegram auth, ни cron secret. Любой, кто знает URL, может многократно запустить Telegram-рассылку всем активным сотрудникам.
- **Минимальное исправление:** защитить отдельным secret header из env или внутренним Railway cron token; добавить ограничение/идемпотентность на день.
- **До пилота:** обязательно.

### P1. Telegram initData не ограничено по возрасту

- **Участки:** `backend/app/auth.py:9-36`.
- **Проблема:** HMAC проверяется правильно, но `auth_date` не валидируется. Перехваченное валидное initData можно повторно использовать неограниченно долго.
- **Минимальное исправление:** проверять наличие и возраст `auth_date` с небольшим допустимым clock skew; TTL вынести в настройку.
- **До пилота:** да.

### P1. Invite token попадает в production logs

- **Участки:** `backend/app/routers/admin.py:331-334`.
- **Проблема:** одноразовый токен приглашения — credential для привязки Telegram аккаунта; его не следует сохранять в Railway logs.
- **Минимальное исправление:** логировать только `user_id`, role и факт создания приглашения, без token/link.
- **До пилота:** да, исправление тривиальное.

### P1. Backend и frontend независимо дублируют permission matrix

- **Участки:** `backend/app/permissions.py:8-79`, `frontend/src/utils/permissions.ts:3-134`.
- **Проблема:** сейчас наборы в целом совпадают, но любое одностороннее изменение меняет видимость UI без изменения реального доступа или наоборот.
- **Минимальное исправление:** не делать refactor до пилота; добавить contract test на роли/permissions. Позже отдавать effective permissions через `/api/me` как источник истины.
- **До пилота:** test — желательно; архитектурное изменение — нет.

## 4. Payroll и финансовая логика

### P0. Employee «К выплате» и team payroll считают разные формулы

- **Участки:** `frontend/src/pages/Dashboard.tsx:69-73`, `frontend/src/pages/Profile.tsx:149-156`, `frontend/src/pages/Payouts.tsx:197-208`, `frontend/src/components/StatsWidget.tsx:50-56`, `backend/app/routers/api.py:512-555`, `backend/app/routers/api.py:630-671`.
- **Проблема:** employee UI считает `approved shifts + bonuses - penalties - expenses`, а team payroll summary считает `approved shifts + bonuses - penalties`. Один и тот же сотрудник и owner могут видеть разные суммы «к выплате».
- **Минимальное исправление:** продуктово определить роль `Expense`. Если это расход кофейни — не вычитать его из зарплаты. Если это employee deduction — преобразовать в единый тип удержания и учитывать одинаково во всех backend totals. Итог «к выплате» должен приходить из одного backend-контракта, а не собираться отдельно на нескольких экранах.
- **До пилота:** обязательно; сверка денег — центральная цель пилота.

### P1. XLSX пересчитывает смену по текущей ставке, а payroll summary использует сохранённую сумму

- **Участки:** `backend/app/routers/api.py:463-486`, `backend/app/routers/api.py:989-1045`.
- **Проблема:** summary складывает `Shift.salary_earned`, а export вызывает `calculate_salary()` с текущими `User.hourly_rate`, `pay_model` и `revenue_percentage`. После изменения ставки история и XLSX расходятся.
- **Минимальное исправление:** для текущего MVP использовать сохранённый `shift.salary_earned` во всех отчётах. Перед развитием payroll runs добавить явный snapshot ставки/модели или snapshot item при finalized run.
- **До пилота:** если XLSX не используется — не блокирует; до коммерческого использования export — обязательно.

### P1. Момент фиксации ставки для pending смены не определён

- **Участки:** `backend/app/routers/api.py:140-160`, `backend/app/routers/api.py:310-321`, `backend/app/models.py:154-187`.
- **Проблема:** `salary_earned` вычисляется при создании pending смены. Если ставку изменить до approve, простое approve сохранит старую сумму, а редактирование времени/выручки пересчитает уже по новой ставке. Результат зависит от того, редактировал ли админ смену.
- **Минимальное исправление:** зафиксировать правило: либо snapshot при создании, либо пересчёт при approve. Для пилота безопаснее явно пересчитать при approve и записать audit, либо сохранять snapshot rate/pay model на Shift.
- **До пилота:** да, если на пилоте возможны изменения ставок внутри месяца; иначе зафиксировать операционное ограничение.

### P1. Корректировка создаётся для текущего UTC-месяца и не проверяет target scope

- **Участки:** `backend/app/routers/api.py:723-742`.
- **Проблема:** месяц/год берутся из `datetime.now(timezone.utc)`, а не из бизнес-таймзоны или выбранного периода. Также target user не проверяется до insert и не ограничивается допустимой точкой для delegated manager.
- **Минимальное исправление:** валидировать target user и scope; на MVP явно использовать timezone заведения/приложения. Позже добавить effective date/period для adjustment.
- **До пилота:** scope — да; timezone — да, если операции делаются около границы месяца.

### Сильная сторона. Approved-only accrual реализован в основных backend totals

- **Участки:** `backend/app/routers/api.py:463-486`, `backend/app/routers/api.py:615-626`, `backend/app/routers/api.py:849-860`.
- **Состояние:** monthly stats и XLSX фильтруют `approved`, payroll summary пропускает pending/rejected. Это соответствует зафиксированной MVP-модели.
- **Действие:** не переписывать формулу без отдельной задачи; закрепить тестами.

## 5. SQLAlchemy и структура БД

### P0. Startup compatibility SQL демотирует всех owner в admin

- **Участки:** `backend/app/database.py:36-88`, особенно `backend/app/database.py:78-80`; текущий enum owner поддерживается в `backend/app/models.py:28-35`.
- **Проблема:** на каждом startup выполняется `UPDATE users SET role = 'admin' WHERE role::text = 'owner'`. Это не legacy-only check: `owner` — актуальная роль модели. Bootstrap owner после следующего deploy становится admin; invariant «Owner always has full access» фактически исчезает.
- **Минимальное исправление:** удалить owner→admin update. Если нужна legacy migration, она должна быть одноразовой, версионированной и запускаться только для действительно старой схемы.
- **До пилота:** обязательно и первым исправлением.

### P1. Схема изменяется raw SQL при каждом startup

- **Участки:** `backend/app/database.py:24-207`.
- **Проблема:** `create_all` смешан с `ALTER TABLE`, enum patching, ручным `CREATE TABLE` и удалением колонок. Типы уже расходятся: model использует SQLAlchemy Enum/JSON, compatibility SQL местами добавляет VARCHAR/JSONB. Startup становится migration runner и single point of failure.
- **Минимальное исправление:** до пилота не внедрять большой Alembic refactor. Зафиксировать текущую production schema, сделать backup/restore smoke и прекратить добавлять новые runtime patches. После freeze перевести изменения на версионированные migrations.
- **До пилота:** стабилизировать и проверить startup — да; полный переход на migrations — нет.

### P1. Duplicate shift protection существует только на уровне приложения

- **Участки:** `backend/app/routers/api.py:126-138`, `backend/app/models.py:154-187`.
- **Проблема:** два параллельных запроса могут оба пройти SELECT и создать pending/approved дубль. UI блокирует повторный submit, но network retry или два клиента остаются.
- **Минимальное исправление:** добавить DB-level partial unique index для `(user_id, date)` на status `pending/approved` и преобразовать integrity error в 409. Сделать это версионированным изменением схемы.
- **До пилота:** желательно; обязательно до расширения пилота.

### P2. Статусы смен описаны противоречиво

- **Участки:** `backend/app/models.py:37-40`, `backend/app/models.py:181-183`, `backend/app/schemas.py:76-82`.
- **Проблема:** `ShiftStatus` содержит только pending/approved, фактическая колонка — String и API поддерживает rejected. Enum выглядит источником истины, но им не является.
- **Минимальное исправление:** после freeze либо удалить неиспользуемый enum, либо сделать единый enum/constraint с pending/approved/rejected через migration.
- **До пилота:** нет, текущее runtime-поведение работает.

### P2. Для частых payroll/history запросов нет явной индексной стратегии

- **Участки:** `backend/app/models.py:154-187`, `backend/app/models.py:257-281`.
- **Проблема:** запросы регулярно фильтруют по `user_id`, `venue_id`, `status`, `date`, `month/year`, но composite indexes не описаны. На 3–10 сотрудниках это не проблема, на сети начнутся full scans.
- **Минимальное исправление:** после пилота снять query profile и добавить индексы под реальные фильтры.
- **До пилота:** нет.

### later. Payroll Runs модели пока не имеют invariants для рабочего использования

- **Участки:** `backend/app/models.py:291-463`, `backend/app/schemas.py:207-271`.
- **Проблема:** модели корректно изолированы от текущего MVP, но перед endpoints понадобятся unique `(payroll_run_id, user_id)`, проверки периода/сумм, idempotency, snapshot links и правила finalized/paid immutability. `venue_id` без workspace scope недостаточен для SaaS.
- **Минимальное исправление:** не подключать модели к UI до отдельной Phase 2B/3 design review и migrations.
- **До пилота:** нет; не трогать текущий payroll summary.

## 6. Runtime risks и blank-screen risks

### P1. Build не покрывает runtime branches и data-shape failures

- **Участки:** `frontend/src/pages/OwnerPanel.tsx`, `frontend/src/pages/History.tsx`, `frontend/src/pages/Payouts.tsx`, `frontend/src/pages/Profile.tsx`; scripts в `frontend/package.json:6-10`.
- **Проблема:** есть только Vite build. Он не открывает страницы, не переключает tabs и не проверяет partially-null API responses — именно такие ошибки ранее давали blank screen.
- **Минимальное исправление:** добавить 4–6 frontend smoke tests с mocked API: employee app, owner tabs, approvals, History, Profile, Payouts. Global ErrorBoundary оставить последней защитой, а не способом тестирования.
- **До пилота:** да.

### P2. ErrorBoundary не даёт телеметрии с реального телефона

- **Участки:** `frontend/src/components/ErrorBoundary.tsx:12-64`, `frontend/src/main.tsx:6-12`.
- **Проблема:** пользователь больше не видит пустой экран — это сильная сторона. Но production error остаётся только в WebView console, которую сложно получить с телефона пилота.
- **Минимальное исправление:** до пилота можно добавить безопасный correlation id и серверное событие без stack/PII; полноценный monitoring подключать позже отдельным решением.
- **До пилота:** желательно, не блокирует.

### P2. localStorage theme access не защищён от WebView storage exception

- **Участки:** `frontend/src/hooks/useTelegramTheme.ts:10-21`, `frontend/src/hooks/useTelegramTheme.ts:71-77`.
- **Проблема:** редкие Telegram/WebView privacy режимы могут бросить исключение на `localStorage.getItem/setItem`. Global ErrorBoundary покажет error screen вместо приложения.
- **Минимальное исправление:** обернуть чтение/запись theme preference в `try/catch` с fallback `system`.
- **До пилота:** желательно, исправление маленькое.

## 7. Multi-venue и будущий multi-workspace

### P0 для нескольких управляющих. Delegated team manager получает глобальный scope всех точек

- **Участки:** `backend/app/routers/admin.py:139-154`, `backend/app/routers/admin.py:343-360`, `backend/app/routers/admin.py:375-443`.
- **Проблема:** endpoints list/edit users и venues не ограничивают пользователя с `can_manage_team` его точкой. Owner/admin должны видеть все точки одного заведения, но delegated manager сейчас также видит и меняет всё.
- **Минимальное исправление:** owner/admin оставляют all-venue scope; пользователь только с delegated permission получает venue scope и не может назначать elevated roles/permissions.
- **До пилота:** обязательно, если будет более одной точки или delegated manager; для одной точки без делегирования риск можно операционно исключить.

### later. Venue не является tenant boundary

- **Участки:** `backend/app/models.py:67-151`, все admin queries в `backend/app/routers/admin.py`.
- **Проблема:** нет `workspace/organization`; все venues одной базы принадлежат одному глобальному пространству. Owner/admin видят все venues/users. Это подходит одной кофейне или одной сети, но не нескольким независимым клиентам.
- **Минимальное исправление:** после подтверждения пилота добавить Workspace и `workspace_id` как явную границу, затем scoped dependencies/query helpers. Не маскировать tenant через venue.
- **До пилота:** нет. До внедрения workspace нельзя размещать независимые компании в одной базе/deployment.

### Сильная сторона. Multi-venue внутри одного бизнеса уже частично работает

- **Участки:** `backend/app/routers/api.py:189-260`, `backend/app/routers/api.py:373-555`, `frontend/src/pages/History.tsx:30-145`.
- **Состояние:** owner/admin могут видеть все точки и фильтровать History/payroll; senior/team scope использует venue fallback через shift/user. Для пилота одной сети это полезная база.
- **Действие:** стабилизировать scope tests, не начинать multi-workspace refactor до пилота.

## 8. API consistency

### P1. Export конкретной точки содержит прямой NameError risk

- **Участки:** `backend/app/routers/api.py:15`, `backend/app/routers/api.py:937-943`.
- **Проблема:** export вызывает `session.get(Venue, venue_id)`, но `Venue` не импортирован в router. Ветка «Все точки» может работать, а export выбранной точки даст 500.
- **Минимальное исправление:** импортировать Venue и добавить endpoint test для all venues, конкретной точки и empty period.
- **До пилота:** нет, если XLSX официально frozen/known issue; до использования export — обязательно.

### P1. Adjustment API не проверяет существование и допустимый scope target user

- **Участки:** `backend/app/routers/api.py:723-742`.
- **Проблема:** пользователь с permission может передать UUID сотрудника другой точки; FK проверит только существование, но не authorization scope. `venue_id` корректировки при этом записывается от инициатора, что создаёт неоднозначный payroll scope.
- **Минимальное исправление:** загрузить target user до insert, проверить active/status и разрешённую точку, записывать согласованный venue snapshot.
- **До пилота:** да для multi-venue/delegated permissions.

### P2. Query parameters периода не валидируются диапазонами

- **Участки:** `backend/app/routers/api.py:190-199`, `backend/app/routers/api.py:374-386`, `backend/app/routers/api.py:834-847`.
- **Проблема:** `month=13` проходит в запросы, а XLSX затем обращается к массиву месяца и падает; год также не ограничен разумным диапазоном.
- **Минимальное исправление:** использовать `Query(ge=1, le=12)` и разумную проверку year во всех period endpoints.
- **До пилота:** желательно, но UI генерирует валидные значения.

### P2. API naming/types содержат накопившиеся расхождения

- **Участки:** `backend/app/routers/api.py:831-841` (`export_csv`/CSV docstring для XLSX), `backend/app/models.py:37-40`, `frontend/src/utils/api.ts:1-588`.
- **Проблема:** устаревшие названия, строковые статусы и ручные frontend normalizers усложняют поддержку контракта. Generic `request<T>` возвращает text как `T` при не-JSON 2xx, поэтому типовая безопасность частичная.
- **Минимальное исправление:** после пилота ввести небольшой contract layer/OpenAPI type generation или хотя бы runtime guards для ключевых responses.
- **До пилота:** нет.

## 9. Test coverage

### P1. Автоматических тестов на критический MVP-flow нет

- **Участки:** весь репозиторий; test/spec/e2e файлы и test scripts не найдены, `frontend/package.json:6-10` содержит только dev/build/preview.
- **Проблема:** compile/build проходят, но не проверяют auth, permissions, approved-only payroll, fixed_shift, venue scope, duplicate shifts, serialization и frontend tabs. Это главный системный источник повторных P0 regression.
- **Минимальное исправление:** не строить большую test platform. Добавить минимальный backend integration suite на отдельной PostgreSQL test DB и frontend smoke suite для основных экранов.
- **До пилота:** да.

Минимальный обязательный набор backend tests:

1. inactive user получает 403;
2. employee не читает audit/admin endpoints;
3. delegated manager не назначает owner и не выходит за venue scope;
4. create shift → pending → approve/reject;
5. payroll/stats/export считают только approved;
6. hourly/fixed_shift/hybrid расчёты;
7. employee и team payout дают одинаковый итог;
8. duplicate shift возвращает 409;
9. fresh DB startup сохраняет owner;
10. export all/single venue/empty period.

Минимальный frontend smoke:

1. employee Dashboard/Shift/History/Payouts/Profile;
2. owner OwnerPanel tabs;
3. approvals с partial data;
4. loading/error/empty states;
5. ErrorBoundary fallback;
6. light/dark render без blank screen.

## 10. Deployment / Railway risks

### P1. Deploy зависит от успешного runtime DDL без отдельной migration/health discipline

- **Участки:** `backend/app/main.py:25-31`, `backend/app/database.py:24-207`, `railway.json:1-9`.
- **Проблема:** приложение не стартует, пока не завершится весь init_db; transient DB error или несовместимый DDL валит deploy. Railway config не задаёт healthcheck path и timeout. Предыдущие production startup incidents уже происходили в этой зоне.
- **Минимальное исправление:** после удаления опасных compatibility SQL добавить `/health` и Railway healthcheck; документировать rollback/restore. DDL постепенно вынести из runtime.
- **До пилота:** healthcheck и fresh/existing DB startup smoke — да; migrations refactor — после freeze.

### P1. Hardcoded Telegram owner автоматически создаётся/активируется на каждом startup

- **Участки:** `backend/app/main.py:32-81`.
- **Проблема:** конкретный Telegram ID зашит в код и получает owner/admin access вне bootstrap env. Это скрытая production policy и нарушение переносимости нового Railway account.
- **Минимальное исправление:** удалить runtime seed после подтверждённого bootstrap либо читать явно заданный `ADMIN_TELEGRAM_ID` env только в controlled bootstrap flow. Не логировать Telegram ID без необходимости.
- **До пилота:** да.

### P1. Backup scripts есть, но нет подтверждённого регулярного backup/restore процесса

- **Участки:** `scripts/db/backup-railway-postgres.ps1`, `scripts/db/restore-railway-postgres.ps1`, `RAILWAY_DB_MIGRATION.md`.
- **Проблема:** после потери прежнего Railway Postgres проект уже столкнулся с отсутствием доступной базы. Для живого пилота данные смен и выплат должны иметь проверяемое восстановление.
- **Минимальное исправление:** настроить регулярный Railway/Postgres backup и один раз выполнить restore drill в отдельную БД; секреты и dumps не коммитить.
- **До пилота:** обязательно.

### P2. Нет CI gate и production smoke automation

- **Участки:** отсутствуют `.github/workflows` и test pipeline; `Dockerfile` выполняет build, но не tests.
- **Проблема:** push в main сразу запускает production deploy, а единственный gate — локальная дисциплина агента/автора.
- **Минимальное исправление:** после появления минимальных tests добавить CI compile/build/tests до deploy. До этого строго проходить `MVP_RELEASE_CHECKLIST.md` и `SMOKE_TESTS.md` вручную.
- **До пилота:** CI желательно; ручной release gate обязателен.

## 11. Технический долг

### P2. Доменные термины частично расходятся

- **Участки:** `Expense` в `backend/app/models.py:197-222`, `AdjustmentType.penalty` в `backend/app/models.py:42-45`, UI «Удержания», XLSX `backend/app/routers/api.py:1069-1077` всё ещё содержит «Штрафы».
- **Проблема:** Expense, penalty и deduction могут означать разные вещи, но часть UI объединяет их в итог выплаты. Это уже влияет на P0 consistency, хотя переименование DB-полей сейчас не нужно.
- **Минимальное исправление:** зафиксировать glossary и mapping в документации/API; внутренние поля оставить backward-compatible до migrations.
- **До пилота:** смысл и формула — да; переименование полей — нет.

### P2. Frontend API layer и OwnerPanel слишком крупные

- **Участки:** `frontend/src/utils/api.ts:1-588`, `frontend/src/pages/OwnerPanel.tsx:1-2229`.
- **Проблема:** изменения требуют читать большие файлы, а unrelated flows легко задеть.
- **Минимальное исправление:** после MVP freeze выносить по домену: `api/shifts`, `api/team`, `api/payroll` и отдельные tab components. Не совмещать с изменением поведения.
- **До пилота:** нет.

### P2. SECRET_KEY имеет небезопасный default, но сейчас фактически не участвует в auth

- **Участки:** `backend/app/config.py:18-20`; других использований `SECRET_KEY` в коде не найдено.
- **Проблема:** настройка создаёт ложное ощущение дополнительной защиты и станет опасной, если позже её начнут использовать для токенов без обязательной env validation.
- **Минимальное исправление:** перед первым реальным использованием сделать secret required in production и fail-fast; сейчас не объявлять это P0 действующего auth.
- **До пилота:** нет, если значение не используется.

## 12. Готовность к пилоту

### Итоговая оценка

Пилот **реалистичен после короткого stabilization pass**, без нового дизайна, web-admin, AI, billing и payroll runs UI.

Что уже достаточно хорошо:

- понятен основной job-to-be-done;
- shift create/approve/reject реализован;
- approved-only filtering есть в backend totals;
- fixed_shift/hourly/hybrid централизованы в `calculate_salary`;
- multi-venue внутри одного бизнеса уже поддержан;
- frontend имеет global ErrorBoundary, loading/error/empty states и mobile safe area;
- Railway image собирает frontend и backend в одном deployable container;
- документация пилота и smoke checklist уже существуют.

Условие допуска к пилоту:

1. закрыты P0 auth/permission endpoints;
2. owner больше не демотируется на startup;
3. employee и owner видят одну и ту же сумму к выплате;
4. fresh/existing DB startup проверены;
5. выполнен backup/restore drill;
6. пройден ручной P0 checklist минимум на двух Telegram аккаунтах;
7. добавлены хотя бы критичные backend integration tests или зафиксирован строгий ручной gate на период пилота.

## 5 главных рисков

1. **Нарушение access control:** inactive users, открытый audit, публичные reminders и role escalation.
2. **Расхождение денег:** employee totals, team payroll и XLSX используют не полностью одинаковые источники/формулы.
3. **Startup schema mutation:** owner демотируется, а raw SQL на каждом deploy может снова остановить Railway.
4. **Отсутствие regression tests:** build зелёный даже при сломанном runtime flow или permission scope.
5. **Ложная multi-tenant готовность:** venues работают для одной сети, но не изолируют независимые компании.

## 5 сильных сторон

1. Основной MVP-flow уже реализован end-to-end, а не только нарисован.
2. Approved-only payroll logic присутствует в основных backend endpoint.
3. Расчёт hourly/fixed_shift/revenue/hybrid собран в одном backend helper.
4. Permission model уже granular и owner имеет понятный full-access invariant на уровне application logic.
5. Frontend mobile-first, имеет global ErrorBoundary, русские основные экраны, light/dark темы и safe-area handling.

## Рекомендуемый порядок следующих 10 задач

1. Удалить startup owner→admin compatibility update и проверить fresh/existing DB startup.
2. Запретить auth для inactive users в единой backend dependency.
3. Закрыть `/api/audit-logs` permission check и `/api/reminders/shifts` cron secret.
4. Закрыть privilege escalation: назначение owner/admin, self-promotion и delegated manager scope.
5. Определить единую роль Expense и выровнять employee/team «К выплате» через backend source of truth.
6. Зафиксировать правило ставки pending смены; выровнять summary/export на сохранённую сумму.
7. Добавить минимальные backend integration tests на auth, permissions, shifts и payroll.
8. Добавить frontend smoke tests на основные страницы и OwnerPanel tabs; сбрасывать local boundary по tab.
9. Настроить backup/restore drill и Railway healthcheck/release gate.
10. Закрыть локальные P1 API дефекты: adjustment target scope, export Venue import, period validation и post-commit audit failures.

## Что сейчас лучше не трогать

- не переписывать FastAPI/React проект с нуля;
- не начинать multi-workspace до подтверждённого пилота;
- не подключать Payroll Runs к UI/endpoints до стабилизации текущего payroll;
- не делать большой OwnerPanel refactor одновременно с permission fixes;
- не строить web-admin до пилота;
- не добавлять AI/DeepSeek, billing и автоматические выплаты;
- не менять approved-only правило;
- не переименовывать массово DB/API поля `penalty`, `hourly_rate`, `venue_id`;
- не продолжать общий visual redesign до закрытия P0;
- не делать XLSX блокером пилота, если основные выплаты корректны и одинаковы в UI.

## Связанные документы

- [AI_RULES.md](AI_RULES.md)
- [AI_HANDOFF.md](AI_HANDOFF.md)
- [MVP_SCOPE.md](MVP_SCOPE.md)
- [SAAS_READINESS_AUDIT.md](SAAS_READINESS_AUDIT.md)
- [PAYROLL_RUNS_DESIGN.md](PAYROLL_RUNS_DESIGN.md)
- [ROADMAP_TO_LAUNCH.md](ROADMAP_TO_LAUNCH.md)
- [SMOKE_TESTS.md](SMOKE_TESTS.md)
- [MVP_RELEASE_CHECKLIST.md](MVP_RELEASE_CHECKLIST.md)
