# Database baseline and restore runbook

## Purpose and hard safety rules

This runbook captures the current PostgreSQL schema and financial baseline before multitenancy migrations.

- Never restore over the active production database.
- Never put passwords or full database URLs in shell history, documentation or committed files.
- Keep dumps outside the application container and outside the repository.
- Encrypt backup files before off-host transfer.
- Do not commit `.dump`, `.sql`, `.backup`, inventory output from production or logs.
- Stop if the target database name, host or environment label is ambiguous.
- The current startup hardcodes an owner Telegram identity and can create/reactivate that owner. This is a known migration risk, not future architecture. Do not start the application against a restored inventory database unless that side effect is intended.

## Required tools

- PostgreSQL 16 client tools compatible with the server.
- `age` or an approved equivalent encryption tool.
- Python 3.12 with `backend/requirements.txt` installed.
- Enough encrypted off-host storage for at least two complete backups.

Use environment variables or a password manager for credentials. The examples intentionally contain placeholders.

## 1. Create a timestamped custom-format dump

Set a private working directory outside the repository on an encrypted disk. Then run:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$env:PGHOST = "DATABASE_HOST"
$env:PGPORT = "5432"
$env:PGDATABASE = "DATABASE_NAME"
$env:PGUSER = "READONLY_BACKUP_USER"
pg_dump --format=custom --compress=9 --no-owner --no-acl --file "shifttracker-$stamp.dump"
pg_dump --schema-only --no-owner --no-acl --file "shifttracker-$stamp-schema.sql"
```

Supply `PGPASSWORD` only through the current process environment or `.pgpass`; clear it after use. Confirm both commands exit with code zero and files are non-empty.

## 2. Encrypt and verify

Using an approved age recipient:

```powershell
age -r "AGE_PUBLIC_RECIPIENT" -o "shifttracker-$stamp.dump.age" "shifttracker-$stamp.dump"
age -r "AGE_PUBLIC_RECIPIENT" -o "shifttracker-$stamp-schema.sql.age" "shifttracker-$stamp-schema.sql"
age --decrypt -i "AGE_PRIVATE_KEY_PATH" -o "restore-check-$stamp.dump" "shifttracker-$stamp.dump.age"
pg_restore --list "restore-check-$stamp.dump" | Select-Object -First 20
```

After verification, securely remove unencrypted working copies according to the host policy. Store encrypted copies off-host with documented retention and checksum.

## 3. Restore only to an isolated database

Create a new empty database whose name clearly contains `restore_test`. Do not reuse the application database:

```powershell
createdb --host "RESTORE_HOST" --port "5432" --username "RESTORE_ADMIN" "shifttracker_restore_test"
pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl --dbname "postgresql://RESTORE_USER@RESTORE_HOST:5432/shifttracker_restore_test" "restore-check-$stamp.dump"
```

The restore host should be network-isolated from Telegram webhooks and production traffic. Do not launch the application lifespan against it.

## 4. Run read-only inventory

Use a dedicated read-only database role where possible:

```powershell
$env:INVENTORY_DATABASE_URL = "postgresql+asyncpg://RESTORE_READONLY_USER:PASSWORD@RESTORE_HOST:5432/shifttracker_restore_test"
python backend/scripts/database_inventory.py --environment test --output "inventory-$stamp.json"
```

For production inventory, the script additionally requires `--confirm-production-read-only`. It never prints the URL and runs inside a read-only transaction. Production inventory JSON is sensitive operational metadata and must not be committed.

## 5. Verify restoration

Compare source and restore inventories through an approved secure channel:

- PostgreSQL version and extensions are compatible.
- Table and column lists match.
- Every table row count matches.
- Critical null counts have not increased.
- Duplicate Telegram ID and invite-token group counts match and are expected to be zero.
- Orphan counts are zero or have a reviewed exception.
- Shift status counts match.
- Approved shift count, hours, salary checksum and total match.
- Adjustment counts, totals and checksums match.
- Payroll run/payment counts, totals and checksums match.
- Payroll source-link counts match.

Run current repository smoke queries and the PostgreSQL integration suite against the isolated database only after making a separate disposable copy; the integration suite drops the `public` schema.

## 6. Restore acceptance record

Record outside the repository:

- backup timestamp and encrypted file checksum;
- source environment label;
- restore database identifier;
- operator and reviewer;
- command exit codes;
- inventory comparison result;
- discrepancies and resolution;
- deletion date for temporary decrypted files.

## Timeweb preparation

- Prefer managed PostgreSQL or a dedicated database container/volume, never the application filesystem.
- Run versioned migrations as a one-off release command before application startup.
- Keep encrypted daily backups off the Timeweb server and rehearse restore quarterly.
- Add live and readiness endpoints before cutover; readiness must check database access and expected migration revision.
- Configure application, web-admin and Telegram webhook public URLs explicitly rather than deriving them from Railway variables.
- Keep Railway rollback available until restore, webhook and payroll smoke tests pass on Timeweb.
