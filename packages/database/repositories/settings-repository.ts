import type Database from "better-sqlite3";

type SettingRow = { setting_key: string; setting_value: string; value_type: "string" | "number" | "boolean" | "json" };
export type AppSettings = Record<string, string | number | boolean | Record<string, unknown>>;

export class SettingsRepository {
  constructor(private readonly db: Database.Database) {}

  getAll(): AppSettings {
    const rows = this.db.prepare("SELECT setting_key, setting_value, value_type FROM app_settings WHERE is_deleted = 0 ORDER BY setting_key ASC").all() as SettingRow[];
    return Object.fromEntries(rows.map((row) => [row.setting_key, coerce(row)]));
  }

  update(settings: Record<string, string | number | boolean>, actorUserId: string): AppSettings {
    const now = new Date().toISOString();
    const write = this.db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        const valueType = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string";
        this.db
          .prepare("INSERT INTO app_settings (id, setting_key, setting_value, value_type, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, value_type = excluded.value_type, updated_at = excluded.updated_at, updated_by = excluded.updated_by, version = app_settings.version + 1")
          .run(`setting_${key}`, key, String(value), valueType, now, now, actorUserId, actorUserId);
      }
    });
    write();
    return this.getAll();
  }
}

function coerce(row: SettingRow) {
  if (row.value_type === "number") return Number(row.setting_value);
  if (row.value_type === "boolean") return row.setting_value === "true" || row.setting_value === "1";
  if (row.value_type === "json") return JSON.parse(row.setting_value) as Record<string, unknown>;
  return row.setting_value;
}
