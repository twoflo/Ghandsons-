-- Server-side validation is enforced in three places: the zod schema at the
-- edge, the money helpers in src/lib/money.ts, and here. The database is the
-- last line — nothing gets a negative total or a fractional cent past it.

ALTER TABLE invoices  DROP CONSTRAINT IF EXISTS invoices_totals_nonneg;
ALTER TABLE invoices  ADD  CONSTRAINT invoices_totals_nonneg
  CHECK (subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0);

ALTER TABLE invoices  DROP CONSTRAINT IF EXISTS invoices_balance_consistent;
ALTER TABLE invoices  ADD  CONSTRAINT invoices_balance_consistent
  CHECK (balance_cents = total_cents - amount_paid_cents);

ALTER TABLE quotes    DROP CONSTRAINT IF EXISTS quotes_totals_nonneg;
ALTER TABLE quotes    ADD  CONSTRAINT quotes_totals_nonneg
  CHECK (subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0);

ALTER TABLE expenses  DROP CONSTRAINT IF EXISTS expenses_totals_consistent;
ALTER TABLE expenses  ADD  CONSTRAINT expenses_totals_consistent
  CHECK (total_cents = subtotal_cents + tax_cents);

ALTER TABLE payments  DROP CONSTRAINT IF EXISTS payments_amount_nonzero;
ALTER TABLE payments  ADD  CONSTRAINT payments_amount_nonzero
  CHECK (amount_cents <> 0);

ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_minutes_sane;
ALTER TABLE time_entries ADD  CONSTRAINT time_entries_minutes_sane
  CHECK (minutes >= 0 AND minutes <= 1440 AND break_minutes >= 0);

ALTER TABLE tax_rates DROP CONSTRAINT IF EXISTS tax_rates_rate_sane;
ALTER TABLE tax_rates ADD  CONSTRAINT tax_rates_rate_sane
  CHECK (rate_bp >= 0 AND rate_bp <= 10000);

ALTER TABLE schedule_events DROP CONSTRAINT IF EXISTS schedule_events_range;
ALTER TABLE schedule_events ADD  CONSTRAINT schedule_events_range
  CHECK (end_at > start_at);

-- One open clock-on per person, ever.
DROP INDEX IF EXISTS time_entries_one_open_per_user;
CREATE UNIQUE INDEX time_entries_one_open_per_user
  ON time_entries (user_id) WHERE status = 'open' AND deleted_at IS NULL;

-- A billable expense can only be pushed onto one invoice line.
DROP INDEX IF EXISTS expenses_billed_once;
CREATE UNIQUE INDEX expenses_billed_once
  ON expenses (billed_invoice_line_id) WHERE billed_invoice_line_id IS NOT NULL;

-- Emails are compared case-insensitively.
DROP INDEX IF EXISTS users_email_lower_uq;
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

-- Fuzzy supplier matching for the receipt extractor.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DROP INDEX IF EXISTS suppliers_name_trgm;
CREATE INDEX suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops);
DROP INDEX IF EXISTS supplier_aliases_trgm;
CREATE INDEX supplier_aliases_trgm ON supplier_aliases USING gin (alias gin_trgm_ops);

-- The audit log is append-only.
CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
