# Railway PostgreSQL migration guide

Эта инструкция описывает только перенос production-базы между Railway проектами.  
Код приложения переносится через GitHub, а база копируется отдельно через `pg_dump` / `pg_restore`.

## Главное

- Не копируйте Railway Postgres volume вручную.
- Не используйте internal Railway URL для переноса.
- Берите именно `DATABASE_PUBLIC_URL`.
- Не коммитьте дампы, backup-файлы и секреты.

## Откуда брать URL

### OLD_DATABASE_URL

Старый Railway проект:

`Postgres-WZvO` → `Variables` → `DATABASE_PUBLIC_URL`

### NEW_DATABASE_URL

Новый Railway проект:

`PostgreSQL` → `Variables` → `DATABASE_PUBLIC_URL`

Важно: `DATABASE_URL` в новом app service должен указывать на **новую** базу, а не на старую.

## Как задать переменные в PowerShell

```powershell
$env:OLD_DATABASE_URL = "DATABASE_PUBLIC_URL старой базы"
$env:NEW_DATABASE_URL = "DATABASE_PUBLIC_URL новой базы"
```

## Backup

Сделать только backup:

```powershell
.\scripts\db\backup-railway-postgres.ps1
```

Скрипт:

- проверяет `pg_dump`, `psql`;
- проверяет `OLD_DATABASE_URL`;
- запрещает internal Railway URL;
- проверяет подключение;
- создаёт `backups/shifttracker_backup_YYYYMMDD_HHMMSS.dump`.

## Restore

Восстановить дамп в новую базу:

```powershell
.\scripts\db\restore-railway-postgres.ps1 -DumpPath ".\backups\shifttracker_backup_20260703_120000.dump"
```

Скрипт:

- проверяет `pg_restore`, `psql`;
- проверяет `NEW_DATABASE_URL`;
- запрещает internal Railway URL;
- проверяет, что файл дампа существует;
- спрашивает подтверждение `YES`;
- выполняет `pg_restore --clean --if-exists --no-owner --no-acl --verbose`.

## Full copy

Сделать полный перенос:

```powershell
.\scripts\db\copy-railway-postgres.ps1
```

Скрипт:

- делает dump старой базы;
- восстанавливает его в новую базу;
- показывает `\dt` до и после;
- сравнивает counts по таблицам:
  - `users`
  - `venues`
  - `shifts`
  - `expenses`
  - `audit_logs`
  - `adjustments`

## Что нужно перенести в новый Railway app service

- `DATABASE_URL`
- `BOT_TOKEN`
- `BOT_USERNAME`
- `SECRET_KEY`
- `WEBAPP_URL`
- `DEBUG`
- `ADMIN_TELEGRAM_ID`, если используется

## Проверка после переноса

После копирования проверьте:

- `/api/health`
- вход через Telegram
- профиль
- историю смен
- создание смены
- утверждение смены
- payroll summary

## Rollback

Старый Railway проект и старую базу не удаляйте, пока новый деплой не проверен вручную.

## Важные замечания

- Если переменные окружения не заданы, real dump/restore не запускать.
- В репозиторий не должны попадать `.dump`, `.sql`, `.backup` и папка `backups/`.
- В консоль не выводите полный `DATABASE_URL` и пароль.
