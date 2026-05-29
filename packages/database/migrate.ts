import type Database from "better-sqlite3";
import { DatabaseError } from "@shared/errors";
import { migrations } from "./migrations";

export function runMigrations(db: Database.Database): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const current = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number };
  const pending = migrations.filter((migration) => migration.version > current.version);
  const apply = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(migration.version, migration.name, new Date().toISOString());
    }
  });

  try {
    apply();
  } catch (error) {
    throw new DatabaseError("Database migration failed", { message: error instanceof Error ? error.message : String(error) });
  }
}
