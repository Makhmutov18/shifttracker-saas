# Payment request idempotency

## Contract

`POST /api/payroll-runs/{id}/payments` accepts optional `idempotency_key`, a UUID identifying one recording operation. Existing clients without a key remain compatible, but do not receive duplicate-request protection.

- The key is scoped to a payroll run and stored atomically with `PayrollPayment` and balance changes.
- The same key, actor and payment fields return the previously created payment without incrementing any amount. This works after the original final payment changed the run to `paid`.
- Reusing a key with a different employee, amount, date, method, comment or recording actor returns `409` without exposing the original payment. Monetary comparison uses the existing rounded two-decimal amount.
- The existing owner/admin authorization and run visibility checks execute before replay lookup. UUID validation returns `422` for an invalid key.
- Responses retain the existing `201` status and shape. The payment is the original immutable record; run/item totals are the latest saved balances, not a cached historical response.
- Existing run/item row locks serialize simultaneous requests, including replicas. A unique database index on `(payroll_run_id, idempotency_key)` is an additional constraint. Nullable keys keep historical and legacy payments compatible.
- Failure before commit rolls back the payment, key and balances together, so the same key can be retried.

The read API and employee payment history do not expose operation keys. There are no new endpoints, dependencies or payroll formulas.

## Clients

Mini App and web-admin create a random UUID on opening a payment form. The key remains stable across network errors and details-refresh errors. A synchronous ref guard prevents a rapid double submit or replacement of a pending operation; no automatic retry is added.

Changing fields after an uncertain outcome does not silently rotate the key. If a payment was already stored, backend returns a conflict rather than guessing the user's intent. After a confirmed validation failure with no stored payment, correcting fields and retrying the key remains safe.

An explicitly opened new form creates a new operation key. Closing/reopening a form, a full page reload or another device is a new operation; users must check payment history after an uncertain result before starting a new operation. Keys are not persisted in browser storage and no sensitive payment data is stored there.

## Schema and rollout

The additive `20261012_add_payment_idempotency.sql` migration and runtime compatibility SQL both add the nullable column and named unique index idempotently. Existing rows remain `NULL`, with their amounts unchanged. Deploy schema/backend support before frontend: an older backend ignores the new optional field and cannot deduplicate requests.

Only the architecture feature branch is updated. This task does not deploy or alter a production database.

## Tests

Focused real-PostgreSQL/ASGI tests cover sequential and simultaneous retries, changed request fields, latest balances, retry after `paid`, permissions/actor isolation, separate operations and legacy clients, invalid UUIDs, run-scoped keys, rollback, direct database uniqueness and compatibility upgrade of an existing table.

Node tests execute both clients' actual payment event handlers with state/network doubles. They check lost responses, refresh failures, rapid double submits, new-form key rotation and no silent rotation after an uncertain edited request. These are not browser or Telegram UI tests.
