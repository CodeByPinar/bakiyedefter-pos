import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DatabaseError } from "@shared/errors";
import { runMigrations } from "./migrate";

export type AppDatabase = {
  path: string;
  handle: Database.Database;
  close(): void;
  integrityCheck(): string;
};

export function createAppDatabase(databasePath: string): AppDatabase {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const handle = new Database(databasePath);
  configureSqlite(handle);
  runMigrations(handle);
  return toAppDatabase(databasePath, handle);
}

export function createMemoryDatabase(): AppDatabase {
  const handle = new Database(":memory:");
  configureSqlite(handle);
  runMigrations(handle);
  return toAppDatabase(":memory:", handle);
}

function toAppDatabase(databasePath: string, handle: Database.Database): AppDatabase {
  return {
    path: databasePath,
    handle,
    close: () => handle.close(),
    integrityCheck: () => (handle.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check
  };
}

function configureSqlite(handle: Database.Database): void {
  try {
    handle.pragma("journal_mode = WAL");
    handle.pragma("foreign_keys = ON");
    handle.pragma("busy_timeout = 5000");
    handle.pragma("synchronous = NORMAL");
    handle.pragma("temp_store = MEMORY");
  } catch (error) {
    throw new DatabaseError("SQLite configuration failed", { message: error instanceof Error ? error.message : String(error) });
  }
}
