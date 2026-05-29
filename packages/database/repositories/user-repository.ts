import type Database from "better-sqlite3";
import type { AuthenticatedUser } from "@domain/users/user-types";
import { createId } from "@domain/shared/ids";
import type { Permission, RoleName } from "@shared/permissions";

type UserRow = { id: string; username: string; display_name: string; password_hash: string; pin_hash: string | null; role_id: RoleName; failed_login_count: number; locked_until: string | null };
export type StoredUser = { id: string; username: string; displayName: string; passwordHash: string; pinHash: string | null; role: RoleName; failedLoginCount: number; lockedUntil: string | null };

export class UserRepository {
  constructor(private readonly db: Database.Database) {}

  countActiveUsers(): number {
    return (this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE is_deleted = 0").get() as { count: number }).count;
  }

  findByUsername(username: string): StoredUser | null {
    const row = this.db.prepare("SELECT id, username, display_name, password_hash, pin_hash, role_id, failed_login_count, locked_until FROM users WHERE username = ? AND is_deleted = 0").get(username) as UserRow | undefined;
    return row ? mapStoredUser(row) : null;
  }

  findById(userId: string): AuthenticatedUser | null {
    const row = this.db.prepare("SELECT id, username, display_name, role_id FROM users WHERE id = ? AND is_deleted = 0").get(userId) as Pick<UserRow, "id" | "username" | "display_name" | "role_id"> | undefined;
    return row ? { id: row.id, username: row.username, displayName: row.display_name, role: row.role_id, permissions: this.getPermissionsForUser(row.id) } : null;
  }

  createOwner(input: { username: string; displayName: string; passwordHash: string }): AuthenticatedUser {
    const now = new Date().toISOString();
    const id = createId("usr");
    this.db
      .prepare("INSERT INTO users (id, username, display_name, password_hash, role_id, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, 'Owner', ?, ?, ?, ?)")
      .run(id, input.username, input.displayName, input.passwordHash, now, now, id, id);
    return this.findById(id)!;
  }

  markLoginSucceeded(userId: string): void {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, userId);
  }

  markLoginFailed(userId: string, lockedUntil: string | null): void {
    this.db.prepare("UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = COALESCE(?, locked_until), updated_at = ? WHERE id = ?").run(lockedUntil, new Date().toISOString(), userId);
  }

  getPermissionsForUser(userId: string): Permission[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT permission_id AS permission FROM role_permissions WHERE role_id = (SELECT role_id FROM users WHERE id = ?) AND is_deleted = 0
         UNION SELECT permission_id AS permission FROM user_permissions WHERE user_id = ? AND granted = 1 AND is_deleted = 0`
      )
      .all(userId, userId) as Array<{ permission: Permission }>;
    return rows.map((row) => row.permission);
  }
}

function mapStoredUser(row: UserRow): StoredUser {
  return { id: row.id, username: row.username, displayName: row.display_name, passwordHash: row.password_hash, pinHash: row.pin_hash, role: row.role_id, failedLoginCount: row.failed_login_count, lockedUntil: row.locked_until };
}
