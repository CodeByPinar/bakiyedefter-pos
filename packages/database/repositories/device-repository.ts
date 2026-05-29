import type Database from "better-sqlite3";
import { createId } from "@domain/shared/ids";

type DeviceRow = { id: string; device_name: string; remembered: number; updated_at: string };

export type RememberedDevice = { id: string; deviceName: string; remembered: boolean; updatedAt: string };

export class DeviceRepository {
  constructor(private readonly db: Database.Database) {}

  remember(input: { deviceName: string; actorUserId: string }): RememberedDevice {
    const now = new Date().toISOString();
    const existing = this.findLatestByName(input.deviceName);

    if (existing) {
      this.db
        .prepare("UPDATE devices SET remembered = 1, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?")
        .run(now, input.actorUserId, existing.id);
      return this.findById(existing.id)!;
    }

    const id = createId("dev");
    this.db
      .prepare("INSERT INTO devices (id, device_name, remembered, created_at, updated_at, created_by, updated_by) VALUES (?, ?, 1, ?, ?, ?, ?)")
      .run(id, input.deviceName, now, now, input.actorUserId, input.actorUserId);
    return this.findById(id)!;
  }

  private findLatestByName(deviceName: string): RememberedDevice | null {
    const row = this.db
      .prepare("SELECT id, device_name, remembered, updated_at FROM devices WHERE device_name = ? AND is_deleted = 0 ORDER BY updated_at DESC LIMIT 1")
      .get(deviceName) as DeviceRow | undefined;
    return row ? mapDevice(row) : null;
  }

  private findById(id: string): RememberedDevice | null {
    const row = this.db.prepare("SELECT id, device_name, remembered, updated_at FROM devices WHERE id = ? AND is_deleted = 0").get(id) as DeviceRow | undefined;
    return row ? mapDevice(row) : null;
  }
}

function mapDevice(row: DeviceRow): RememberedDevice {
  return { id: row.id, deviceName: row.device_name, remembered: row.remembered === 1, updatedAt: row.updated_at };
}
