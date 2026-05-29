import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { AuthService } from "@application/auth/auth-service";
import type { AppDatabase } from "@database/connection";
import type { BackupHistoryRepository } from "@database/repositories/backup-history-repository";
import { BackupError } from "@shared/errors";

export class BackupService {
  constructor(private readonly auth: AuthService, private readonly appDatabase: AppDatabase, private readonly backupHistory: BackupHistoryRepository, private readonly defaultBackupDir: string) {}

  async createManualBackup(targetDir?: string) {
    const user = this.auth.requirePermission("Backup.Create");
    const backupDir = targetDir?.trim() || this.defaultBackupDir;
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `bakiyedefter-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
    try {
      await this.appDatabase.handle.backup(backupPath);
      const checksum = sha256File(backupPath);
      const record = this.backupHistory.recordCreated({ path: backupPath, sizeBytes: fs.statSync(backupPath).size, checksum, backupType: "manual", actorUserId: user.id });
      verifySqliteBackup(backupPath);
      return this.backupHistory.markVerified(record.id);
    } catch (error) {
      throw new BackupError("Manual backup failed", { message: error instanceof Error ? error.message : String(error), backupPath });
    }
  }

  list() {
    this.auth.requirePermission("Backup.Create");
    return this.backupHistory.list();
  }
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifySqliteBackup(filePath: string): void {
  const db = new Database(filePath, { readonly: true });
  try {
    const result = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    if (result.integrity_check !== "ok") throw new BackupError("Backup integrity check failed", { result: result.integrity_check });
  } finally {
    db.close();
  }
}
