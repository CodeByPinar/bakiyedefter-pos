import type { Migration } from ".";

export const customerCodeAndPosIntegration: Migration = {
  version: 3,
  name: "customer_code_and_pos_integration",
  sql: `
ALTER TABLE customers ADD COLUMN customer_code TEXT;
UPDATE customers
SET customer_code =
  'CR' || strftime('%d%m', created_at) || '-MG' ||
  substr('00' || rowid, -2, 2) ||
  'K' || substr('00' || ((rowid * 17 + length(display_name)) % 100), -2, 2)
WHERE customer_code IS NULL;
CREATE UNIQUE INDEX idx_customers_customer_code ON customers(customer_code);
CREATE INDEX idx_customers_customer_code_search ON customers(customer_code, is_deleted);

CREATE TABLE pos_terminals (
  id TEXT PRIMARY KEY,
  terminal_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK(connection_type IN ('manual', 'tcp', 'serial', 'usb')),
  endpoint TEXT,
  port INTEGER,
  pairing_key TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  last_connected_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pos_connection_events (
  id TEXT PRIMARY KEY,
  terminal_id TEXT REFERENCES pos_terminals(id),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_pos_terminals_status ON pos_terminals(status, is_deleted);
CREATE INDEX idx_pos_events_terminal_id ON pos_connection_events(terminal_id, created_at);

INSERT INTO app_settings (id, setting_key, setting_value, value_type, created_at, updated_at)
VALUES
  ('setting_posIntegrationEnabled', 'posIntegrationEnabled', 'false', 'boolean', datetime('now'), datetime('now')),
  ('setting_posProvider', 'posProvider', 'local-terminal', 'string', datetime('now'), datetime('now')),
  ('setting_posConnectionMode', 'posConnectionMode', 'manual', 'string', datetime('now'), datetime('now')),
  ('setting_posTimeoutSeconds', 'posTimeoutSeconds', '10', 'number', datetime('now'), datetime('now'));
`
};
