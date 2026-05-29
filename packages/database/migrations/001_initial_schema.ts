import { permissions, rolePermissionMap, roles } from "@shared/permissions";
import type { Migration } from ".";

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;
const common = `
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0`;

function simpleTable(name: string, columns: string, constraints = ""): string {
  return `CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${columns}, ${common}${constraints});`;
}

const roleSeeds = roles.map((role) => `INSERT INTO roles (id, name, created_at, updated_at) VALUES (${q(role)}, ${q(role)}, datetime('now'), datetime('now'));`).join("\n");
const permissionSeeds = permissions.map((permission) => `INSERT INTO permissions (id, name, created_at, updated_at) VALUES (${q(permission)}, ${q(permission)}, datetime('now'), datetime('now'));`).join("\n");
const rolePermissionSeeds = Object.entries(rolePermissionMap)
  .flatMap(([role, rolePermissions]) =>
    rolePermissions.map((permission) => `INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at) VALUES (${q(`${role}:${permission}`)}, ${q(role)}, ${q(permission)}, datetime('now'), datetime('now'));`)
  )
  .join("\n");

export const initialSchema: Migration = {
  version: 1,
  name: "initial_schema",
  sql: `
${simpleTable("roles", "name TEXT NOT NULL UNIQUE")}
${simpleTable("permissions", "name TEXT NOT NULL UNIQUE")}
${simpleTable("role_permissions", "role_id TEXT NOT NULL REFERENCES roles(id), permission_id TEXT NOT NULL REFERENCES permissions(id)", ", UNIQUE(role_id, permission_id)")}
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  ${common}
);
${simpleTable("user_permissions", "user_id TEXT NOT NULL REFERENCES users(id), permission_id TEXT NOT NULL REFERENCES permissions(id), granted INTEGER NOT NULL DEFAULT 1", ", UNIQUE(user_id, permission_id)")}
${simpleTable("sessions", "user_id TEXT NOT NULL REFERENCES users(id), device_id TEXT, expires_at TEXT NOT NULL, revoked_at TEXT")}
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  phone TEXT,
  normalized_phone TEXT,
  note TEXT,
  risk_status TEXT NOT NULL DEFAULT 'standard',
  current_balance_cents INTEGER NOT NULL DEFAULT 0,
  last_ledger_at TEXT,
  archived_at TEXT,
  ${common}
);
${simpleTable("customer_contacts", "customer_id TEXT NOT NULL REFERENCES customers(id), contact_type TEXT NOT NULL, value TEXT NOT NULL, normalized_value TEXT")}
${simpleTable("customer_addresses", "customer_id TEXT NOT NULL REFERENCES customers(id), label TEXT NOT NULL, address_line TEXT NOT NULL")}
${simpleTable("customer_notes", "customer_id TEXT NOT NULL REFERENCES customers(id), note TEXT NOT NULL")}
${simpleTable("customer_tags", "name TEXT NOT NULL UNIQUE, color TEXT")}
${simpleTable("customer_tag_links", "customer_id TEXT NOT NULL REFERENCES customers(id), tag_id TEXT NOT NULL REFERENCES customer_tags(id)", ", UNIQUE(customer_id, tag_id)")}
${simpleTable("customer_risk_profiles", "customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id), risk_status TEXT NOT NULL DEFAULT 'standard', risk_note TEXT, last_reviewed_at TEXT")}
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  transaction_type TEXT NOT NULL,
  total_amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted',
  description TEXT,
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  ${common}
);
${simpleTable("transaction_items", "transaction_id TEXT NOT NULL REFERENCES transactions(id), item_type TEXT NOT NULL, label TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit_amount_cents INTEGER NOT NULL, total_amount_cents INTEGER NOT NULL")}
${simpleTable("transaction_snapshots", "transaction_id TEXT NOT NULL REFERENCES transactions(id), customer_balance_before_cents INTEGER NOT NULL, customer_balance_after_cents INTEGER NOT NULL, payload_json TEXT NOT NULL")}
${simpleTable("transaction_voids", "original_ledger_entry_id TEXT NOT NULL UNIQUE, void_ledger_entry_id TEXT NOT NULL, reason TEXT NOT NULL")}
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  event_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('debit', 'credit', 'neutral')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  description TEXT,
  occurred_at TEXT NOT NULL,
  source_transaction_id TEXT NOT NULL REFERENCES transactions(id),
  voids_ledger_entry_id TEXT REFERENCES ledger_entries(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT,
  ${common}
);
${simpleTable("payments", "transaction_id TEXT NOT NULL REFERENCES transactions(id), ledger_entry_id TEXT NOT NULL REFERENCES ledger_entries(id), customer_id TEXT NOT NULL REFERENCES customers(id), amount_cents INTEGER NOT NULL, payment_method TEXT NOT NULL DEFAULT 'cash'")}
${simpleTable("debts", "transaction_id TEXT NOT NULL REFERENCES transactions(id), ledger_entry_id TEXT NOT NULL REFERENCES ledger_entries(id), customer_id TEXT NOT NULL REFERENCES customers(id), amount_cents INTEGER NOT NULL, due_at TEXT")}
${simpleTable("products", "name TEXT NOT NULL, barcode TEXT, category_id TEXT, price_cents INTEGER NOT NULL DEFAULT 0")}
${simpleTable("categories", "name TEXT NOT NULL UNIQUE")}
${simpleTable("stock_movements", "product_id TEXT NOT NULL REFERENCES products(id), movement_type TEXT NOT NULL, quantity REAL NOT NULL")}
${simpleTable("reports_cache", "report_key TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL, expires_at TEXT")}
${simpleTable("daily_summaries", "summary_date TEXT NOT NULL UNIQUE, debt_added_cents INTEGER NOT NULL DEFAULT 0, payment_received_cents INTEGER NOT NULL DEFAULT 0")}
${simpleTable("monthly_summaries", "summary_month TEXT NOT NULL UNIQUE, debt_added_cents INTEGER NOT NULL DEFAULT 0, payment_received_cents INTEGER NOT NULL DEFAULT 0")}
${simpleTable("whatsapp_templates", "name TEXT NOT NULL, body TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0")}
${simpleTable("reminders", "customer_id TEXT NOT NULL REFERENCES customers(id), template_id TEXT REFERENCES whatsapp_templates(id), scheduled_at TEXT, sent_at TEXT, status TEXT NOT NULL DEFAULT 'prepared'")}
${simpleTable("reminder_logs", "reminder_id TEXT NOT NULL REFERENCES reminders(id), customer_id TEXT NOT NULL REFERENCES customers(id), status TEXT NOT NULL, message_body TEXT NOT NULL")}
CREATE TABLE audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, metadata_json TEXT, created_at TEXT NOT NULL);
${simpleTable("system_logs", "level TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL, metadata_json TEXT")}
${simpleTable("print_jobs", "job_type TEXT NOT NULL, printer_name TEXT, status TEXT NOT NULL, payload_json TEXT, error_message TEXT")}
${simpleTable("backup_history", "path TEXT NOT NULL, size_bytes INTEGER NOT NULL, checksum TEXT NOT NULL, status TEXT NOT NULL, backup_type TEXT NOT NULL, verified_at TEXT")}
${simpleTable("sync_queue", "aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'")}
${simpleTable("app_settings", "setting_key TEXT NOT NULL UNIQUE, setting_value TEXT NOT NULL, value_type TEXT NOT NULL DEFAULT 'string'")}
${simpleTable("devices", "device_name TEXT NOT NULL, remembered INTEGER NOT NULL DEFAULT 0")}
${simpleTable("cash_registers", "name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active'")}
CREATE INDEX idx_customers_name ON customers(normalized_name);
CREATE INDEX idx_customers_phone ON customers(normalized_phone);
CREATE INDEX idx_customers_is_deleted ON customers(is_deleted);
CREATE INDEX idx_ledger_customer_id ON ledger_entries(customer_id);
CREATE INDEX idx_ledger_created_at ON ledger_entries(created_at);
CREATE INDEX idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_audit_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX idx_backup_created_at ON backup_history(created_at);
${roleSeeds}
${permissionSeeds}
${rolePermissionSeeds}
INSERT INTO app_settings (id, setting_key, setting_value, value_type, created_at, updated_at)
VALUES
  ('setting_currency', 'currency', 'TRY', 'string', datetime('now'), datetime('now')),
  ('setting_date_format', 'dateFormat', 'dd.MM.yyyy', 'string', datetime('now'), datetime('now')),
  ('setting_session_timeout', 'sessionTimeoutMinutes', '30', 'number', datetime('now'), datetime('now')),
  ('setting_backup_hour', 'autoBackupHour', '21:00', 'string', datetime('now'), datetime('now'));
INSERT INTO whatsapp_templates (id, name, body, is_default, created_at, updated_at)
VALUES ('template_default_debt_reminder', 'Varsayılan Borç Hatırlatma', 'Merhaba {customerName}, BakiyeDefter kayıtlarına göre mevcut bakiyeniz {balance} TL görünmektedir. Uygun olduğunuzda uğrayabilirsiniz. İyi günler.', 1, datetime('now'), datetime('now'));
`
};
