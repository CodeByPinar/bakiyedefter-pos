import fs from "node:fs";
import path from "node:path";
import type { AuthService } from "@application/auth/auth-service";
import type { AppDatabase } from "@database/connection";
import type { BackupHistoryRepository } from "@database/repositories/backup-history-repository";

export class SystemHealthService {
  constructor(private readonly auth: AuthService, private readonly appDatabase: AppDatabase, private readonly backups: BackupHistoryRepository, private readonly backupDir: string, private readonly appVersion: string) {}

  getLoginStatus() {
    const latest = this.backups.latest();
    const integrityCheck = this.appDatabase.integrityCheck();
    return {
      databaseReady: integrityCheck === "ok",
      databaseStatus: integrityCheck === "ok" ? ("ok" as const) : ("failed" as const),
      backupReady: canAccessFolder(this.backupDir),
      lastBackupAt: latest?.createdAt ?? null,
      offlineSupported: true,
      appVersion: this.appVersion
    };
  }

  getHealth() {
    this.auth.requirePermission("Report.View");
    const latest = this.backups.latest();
    const integrityCheck = this.appDatabase.integrityCheck();
    return {
      databaseStatus: integrityCheck === "ok" ? ("ok" as const) : ("failed" as const),
      integrityCheck,
      databasePath: this.appDatabase.path,
      databaseSizeBytes: this.appDatabase.path === ":memory:" ? 0 : safeFileSize(this.appDatabase.path),
      lastBackupAt: latest?.createdAt ?? null,
      lastBackupStatus: latest?.status ?? null,
      backupFolderAccessible: canAccessFolder(this.backupDir),
      diskAvailableBytes: diskAvailableBytes(this.backupDir),
      pendingSyncCount: this.pendingSyncCount(),
      appVersion: this.appVersion
    };
  }

  runIntegrityCheck() {
    this.auth.requirePermission("Report.View");
    return { result: this.appDatabase.integrityCheck() };
  }

  private pendingSyncCount(): number {
    try {
      return (this.appDatabase.handle.prepare("SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'pending' AND is_deleted = 0").get() as { count: number }).count;
    } catch {
      return 0;
    }
  }
}

function safeFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function canAccessFolder(folderPath: string): boolean {
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    fs.accessSync(folderPath, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function diskAvailableBytes(folderPath: string): number | null {
  try {
    const stats = fs.statfsSync(path.parse(path.resolve(folderPath)).root);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}
