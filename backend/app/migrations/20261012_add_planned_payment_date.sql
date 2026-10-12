ALTER TABLE payroll_runs
ADD COLUMN IF NOT EXISTS planned_payment_date DATE;
