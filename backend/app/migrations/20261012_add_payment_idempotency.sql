ALTER TABLE payroll_payments
ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ix_payroll_payments_run_idempotency
ON payroll_payments(payroll_run_id, idempotency_key);
