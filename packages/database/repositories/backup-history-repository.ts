import type Database from "better-sqlite3";
import { createId } from "@domain/shared/ids";

export type BackupHistoryRecord = { id: string; path: string; sizeBytes: number; checksum: string; status: "created" | "verified" | "failed"; backupType: "manual" | "automatic" | "snapshot"; verifiedAt: string | null; createdAt: string; createdBy: string | null };
type BackupRow = { id: string; path: string; size_bytes: number; checksum: string; status: BackupHistoryRecord["status"]; backup_type: BackupHistoryRecord["backupType"]; verified_at: string | null; created_at: string; created_by: string | null };

export class BackupHistoryRepository {
  constructor(private readonly db: Database.Database) {}

  recordCreated(input: { path: string; sizeBytes: number; checksum: string; backupType: BackupHistoryRecord["backupType"]; actorUserId: string }): BackupHistoryRecord {
    const now = new Date().toISOString();
    const id = createId("bak");
    this.db.prepare("INSERT INTO backup_history (id, path, size_bytes, checksum, status, backup_type, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, 'created', ?, ?, ?, ?, ?)").run(id, input.path, input.sizeBytes, input.checksum, input.backupType, now, now, input.actorUserId, input.actorUserId);
    return this.findById(id)!;
  }

  markVerified(id: string): BackupHistoryRecord {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE backup_history SET status = 'verified', verified_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
    return this.findById(id)!;
  }

  list(limit = 50): BackupHistoryRecord[] {
    const rows = this.db.prepare("SELECT id, path, size_bytes, checksum, status, backup_type, verified_at, created_at, created_by FROM backup_history WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT ?").all(Math.min(limit, 200)) as BackupRow[];
    return rows.map(mapBackup);
  }

  latest(): BackupHistoryRecord | null {
    const row = this.db.prepare("SELECT id, path, size_bytes, checksum, status, backup_type, verified_at, created_at, created_by FROM backup_history WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 1").get() as BackupRow | undefined;
    return row ? mapBackup(row) : null;
  }

  private findById(id: string): BackupHistoryRecord | null {
    const row = this.db.prepare("SELECT id, path, size_bytes, checksum, status, backup_type, verified_at, created_at, created_by FROM backup_history WHERE id = ? AND is_deleted = 0").get(id) as BackupRow | undefined;
    return row ? mapBackup(row) : null;
  }
}

function mapBackup(row: BackupRow): BackupHistoryRecord {
  return { id: row.id, path: row.path, sizeBytes: row.size_bytes, checksum: row.checksum, status: row.status, backupType: row.backup_type, verifiedAt: row.verified_at, createdAt: row.created_at, createdBy: row.created_by };
}
