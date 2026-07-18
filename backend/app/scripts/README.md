# Demo company seeder

`seed_demo_company.py` is intended only for test and demo environments. It resets operational data and creates a deterministic two-venue coffee company for product demonstrations and AI weekly-summary checks.

Create a database backup before using apply mode. Without a backup, the reset is irreversible.

Run a read-only preview from the `backend` directory:

```text
python -m app.scripts.seed_demo_company
```

Apply the reset and seed only after reviewing the dry-run output:

```text
python -m app.scripts.seed_demo_company --apply --confirm RESET_TEST_DATABASE
```

For a reproducible local date, append `--as-of YYYY-MM-DD` to either command.

Existing `owner` and `admin` users are preserved and assigned to the primary demo venue. Their authentication data, names, roles, and permissions remain intact. Other users, venues, shifts, adjustments, expenses, audit records, payroll data, and payroll schedule settings are removed before the demo dataset is created.

The script never calls the AI provider. It only prepares data that can later be used to test the existing weekly-summary flow.
