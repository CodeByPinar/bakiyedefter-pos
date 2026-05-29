import type { Migration } from ".";

export const customerFinanceProfile: Migration = {
  version: 2,
  name: "customer_finance_profile",
  sql: `
ALTER TABLE customers ADD COLUMN credit_limit_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN payment_terms_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE customers ADD COLUMN last_contacted_at TEXT;
CREATE INDEX idx_customers_credit_limit ON customers(credit_limit_cents);
CREATE INDEX idx_customers_payment_terms ON customers(payment_terms_days);
`
};
