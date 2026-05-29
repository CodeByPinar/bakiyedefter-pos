import type Database from "better-sqlite3";
import { createId } from "@domain/shared/ids";

export class AuditLogRepository {
  constructor(private readonly db: Database.Database) {}

  record(input: { actorUserId?: string | null; action: string; entityType: string; entityId?: string | null; metadata?: Record<string, unknown> }): void {
    this.db
      .prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(createId("aud"), input.actorUserId ?? null, input.action, input.entityType, input.entityId ?? null, input.metadata ? JSON.stringify(input.metadata) : null, new Date().toISOString());
  }
}
