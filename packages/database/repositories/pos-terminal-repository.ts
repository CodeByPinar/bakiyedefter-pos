import type Database from "better-sqlite3";
import { createId } from "@domain/shared/ids";

export type PosConnectionType = "manual" | "tcp" | "serial" | "usb";
export type PosTerminalStatus = "inactive" | "connected" | "failed" | "unsupported";

export type PosTerminalRecord = {
  id: string;
  terminalCode: string;
  displayName: string;
  provider: string;
  connectionType: PosConnectionType;
  endpoint: string | null;
  port: number | null;
  pairingKey: string | null;
  status: PosTerminalStatus;
  lastConnectedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PosConnectionEventRecord = {
  id: string;
  terminalId: string | null;
  eventType: string;
  status: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type PosTerminalRow = {
  id: string;
  terminal_code: string;
  display_name: string;
  provider: string;
  connection_type: PosConnectionType;
  endpoint: string | null;
  port: number | null;
  pairing_key: string | null;
  status: PosTerminalStatus;
  last_connected_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type PosConnectionEventRow = {
  id: string;
  terminal_id: string | null;
  event_type: string;
  status: string;
  message: string | null;
  metadata_json: string | null;
  created_at: string;
};

export class PosTerminalRepository {
  constructor(private readonly db: Database.Database) {}

  list(): PosTerminalRecord[] {
    const rows = this.db
      .prepare("SELECT id, terminal_code, display_name, provider, connection_type, endpoint, port, pairing_key, status, last_connected_at, last_error, created_at, updated_at FROM pos_terminals WHERE is_deleted = 0 ORDER BY updated_at DESC, terminal_code ASC")
      .all() as PosTerminalRow[];
    return rows.map(mapTerminal);
  }

  findById(id: string): PosTerminalRecord | null {
    const row = this.db
      .prepare("SELECT id, terminal_code, display_name, provider, connection_type, endpoint, port, pairing_key, status, last_connected_at, last_error, created_at, updated_at FROM pos_terminals WHERE id = ? AND is_deleted = 0")
      .get(id) as PosTerminalRow | undefined;
    return row ? mapTerminal(row) : null;
  }

  upsert(input: {
    id?: string;
    terminalCode: string;
    displayName: string;
    provider: string;
    connectionType: PosConnectionType;
    endpoint?: string | null;
    port?: number | null;
    pairingKey?: string | null;
    actorUserId: string;
  }): PosTerminalRecord {
    const now = new Date().toISOString();
    const id = input.id ?? createId("pos");
    const existing = input.id ? this.findById(input.id) : null;

    if (existing) {
      this.db
        .prepare(
          "UPDATE pos_terminals SET terminal_code = ?, display_name = ?, provider = ?, connection_type = ?, endpoint = ?, port = ?, pairing_key = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND is_deleted = 0"
        )
        .run(input.terminalCode, input.displayName, input.provider, input.connectionType, input.endpoint ?? null, input.port ?? null, input.pairingKey ?? null, now, input.actorUserId, id);
      return this.findById(id)!;
    }

    this.db
      .prepare(
        "INSERT INTO pos_terminals (id, terminal_code, display_name, provider, connection_type, endpoint, port, pairing_key, status, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inactive', ?, ?, ?, ?)"
      )
      .run(id, input.terminalCode, input.displayName, input.provider, input.connectionType, input.endpoint ?? null, input.port ?? null, input.pairingKey ?? null, now, now, input.actorUserId, input.actorUserId);
    return this.findById(id)!;
  }

  updateStatus(input: { terminalId: string; status: PosTerminalStatus; lastConnectedAt?: string | null; lastError?: string | null; actorUserId: string }): PosTerminalRecord {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE pos_terminals SET status = ?, last_connected_at = COALESCE(?, last_connected_at), last_error = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND is_deleted = 0")
      .run(input.status, input.lastConnectedAt ?? null, input.lastError ?? null, now, input.actorUserId, input.terminalId);
    return this.findById(input.terminalId)!;
  }

  recordEvent(input: { terminalId?: string | null; eventType: string; status: string; message?: string | null; metadata?: Record<string, unknown> | null }): PosConnectionEventRecord {
    const id = createId("posevt");
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO pos_connection_events (id, terminal_id, event_type, status, message, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.terminalId ?? null, input.eventType, input.status, input.message ?? null, input.metadata ? JSON.stringify(input.metadata) : null, now);
    return this.findEventById(id)!;
  }

  latestEvent(terminalId?: string | null): PosConnectionEventRecord | null {
    const row = terminalId
      ? (this.db.prepare("SELECT id, terminal_id, event_type, status, message, metadata_json, created_at FROM pos_connection_events WHERE terminal_id = ? ORDER BY created_at DESC LIMIT 1").get(terminalId) as PosConnectionEventRow | undefined)
      : (this.db.prepare("SELECT id, terminal_id, event_type, status, message, metadata_json, created_at FROM pos_connection_events ORDER BY created_at DESC LIMIT 1").get() as PosConnectionEventRow | undefined);
    return row ? mapEvent(row) : null;
  }

  countByDatePrefix(prefix: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM pos_terminals WHERE terminal_code LIKE ?").get(`${prefix}%`) as { count: number };
    return row.count;
  }

  existsByCode(terminalCode: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM pos_terminals WHERE terminal_code = ? LIMIT 1").get(terminalCode));
  }

  private findEventById(id: string): PosConnectionEventRecord | null {
    const row = this.db.prepare("SELECT id, terminal_id, event_type, status, message, metadata_json, created_at FROM pos_connection_events WHERE id = ?").get(id) as PosConnectionEventRow | undefined;
    return row ? mapEvent(row) : null;
  }
}

function mapTerminal(row: PosTerminalRow): PosTerminalRecord {
  return {
    id: row.id,
    terminalCode: row.terminal_code,
    displayName: row.display_name,
    provider: row.provider,
    connectionType: row.connection_type,
    endpoint: row.endpoint,
    port: row.port,
    pairingKey: row.pairing_key,
    status: row.status,
    lastConnectedAt: row.last_connected_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEvent(row: PosConnectionEventRow): PosConnectionEventRecord {
  return {
    id: row.id,
    terminalId: row.terminal_id,
    eventType: row.event_type,
    status: row.status,
    message: row.message,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
    createdAt: row.created_at
  };
}
