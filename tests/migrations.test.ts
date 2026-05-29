import { describe, expect, it } from "vitest";
import { createMemoryDatabase } from "@database/connection";

describe("database migrations", () => {
  it("creates schema version and required seed records without demo data", () => {
    const database = createMemoryDatabase();
    try {
      const migration = database.handle.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as { version: number };
      const users = database.handle.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
      const roles = database.handle.prepare("SELECT COUNT(*) AS count FROM roles").get() as { count: number };
      const customers = database.handle.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number };
      const posSettings = database.handle.prepare("SELECT COUNT(*) AS count FROM app_settings WHERE setting_key LIKE 'pos%'").get() as { count: number };
      const posTables = database.handle.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('pos_terminals', 'pos_connection_events')").get() as { count: number };
      expect(migration.version).toBe(3);
      expect(users.count).toBe(0);
      expect(roles.count).toBeGreaterThan(0);
      expect(customers.count).toBe(0);
      expect(posSettings.count).toBeGreaterThanOrEqual(4);
      expect(posTables.count).toBe(2);
      expect(database.integrityCheck()).toBe("ok");
    } finally {
      database.close();
    }
  });
});
