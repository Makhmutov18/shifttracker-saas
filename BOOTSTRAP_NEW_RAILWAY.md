# Bootstrap for a fresh Railway PostgreSQL

Этот документ нужен для случая, когда старую Railway-базу не переносим и поднимаем новый Railway account с пустой PostgreSQL.

## Что делаем

1. Создаём новую Railway PostgreSQL.
2. Подключаем в новом app service переменную `DATABASE_URL` на новую базу.
3. Переносим runtime variables:
   - `BOT_TOKEN`
   - `BOT_USERNAME`
   - `SECRET_KEY`
   - `WEBAPP_URL`
   - при необходимости `RAILWAY_PUBLIC_DOMAIN`
4. Временно задаём bootstrap-переменные.
5. Запускаем bootstrap.
6. После проверки удаляем `BOOTSTRAP_*` переменные или оставляем их, если они больше не используются в runtime.

## Важно

- Старую базу не переносим.
- `DATABASE_URL` должен указывать только на новую Railway PostgreSQL.
- В код не вставляем реальные строки подключения.
- Секреты не коммитим.
- `BOOTSTRAP_*` нужны только для разового первичного заполнения.

## Что делает bootstrap

Скрипт [`scripts/db/bootstrap_admin.py`](scripts/db/bootstrap_admin.py):

- подключается к `DATABASE_URL`;
- создаёт таблицы через существующий `Base.metadata.create_all`;
- находит или создаёт venue;
- находит пользователя по `BOOTSTRAP_TELEGRAM_ID`;
- если пользователь не найден, создаёт его;
- если пользователь найден, обновляет его до `owner`;
- привязывает к venue;
- выставляет ставку и модель оплаты;
- повторный запуск не создаёт дубликаты.

## Какие переменные нужны

Обязательные:

- `DATABASE_URL`
- `BOOTSTRAP_TELEGRAM_ID`

Необязательные:

- `BOOTSTRAP_NAME` = `Owner`
- `BOOTSTRAP_USERNAME`
- `BOOTSTRAP_VENUE_NAME` = `Main venue`
- `BOOTSTRAP_RATE` = `0`
- `BOOTSTRAP_PAYMENT_MODEL` = `hourly`

## Локальный запуск в PowerShell

```powershell
$env:DATABASE_URL = "DATABASE_PUBLIC_URL новой базы"
$env:BOOTSTRAP_TELEGRAM_ID = "ваш telegram id"
$env:BOOTSTRAP_NAME = "Emil"
$env:BOOTSTRAP_USERNAME = "Emakhmutov1"
$env:BOOTSTRAP_VENUE_NAME = "Тестовая точка"
$env:BOOTSTRAP_RATE = "250"
$env:BOOTSTRAP_PAYMENT_MODEL = "hourly"

python scripts/db/bootstrap_admin.py
```

## Запуск после создания новой Railway базы

1. В Railway app service задайте `DATABASE_URL` новой базы.
2. Перенесите `BOT_TOKEN`, `BOT_USERNAME`, `SECRET_KEY`, `WEBAPP_URL`.
3. Временно добавьте `BOOTSTRAP_*`.
4. Запустите:

```powershell
python scripts/db/bootstrap_admin.py
```

5. Проверьте вход в Telegram, `/api/health`, создание смены и профиль.
6. Удалите `BOOTSTRAP_*` после проверки, если они больше не нужны.

## Важное уточнение

В приложении уже есть собственный runtime-seed администратора в `backend/app/main.py`.  
Этот bootstrap не дублирует его логику, а даёт безопасный путь для нового Railway аккаунта, когда нужно вручную поднять свою первую venue и своего первого owner/admin без переноса старой базы.

## Примечание про username

В текущей схеме нет отдельного поля `username` у пользователя.  
`BOOTSTRAP_USERNAME` принимается скриптом как безопасная вспомогательная переменная для контекста и логов, но не хранится отдельно в БД без изменения схемы.

## Что делать после bootstrap

- открыть приложение на новом Railway;
- проверить Telegram login;
- проверить профиль;
- проверить создание смены;
- проверить approve flow;
- проверить payroll summary;
- убедиться, что новый user и venue созданы ровно один раз.
