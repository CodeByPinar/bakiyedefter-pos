import net from "node:net";
import type { AuthService } from "@application/auth/auth-service";
import type { AuditLogRepository } from "@database/repositories/audit-log-repository";
import type { PosConnectionType, PosTerminalRecord, PosTerminalRepository } from "@database/repositories/pos-terminal-repository";
import type { SettingsRepository } from "@database/repositories/settings-repository";
import { AppError, ValidationError } from "@shared/errors";

export type PosConnectionResult = {
  terminal: PosTerminalRecord;
  connected: boolean;
  status: PosTerminalRecord["status"] | "manual";
  message: string;
  checkedAt: string;
};

export class PosService {
  constructor(
    private readonly auth: AuthService,
    private readonly terminals: PosTerminalRepository,
    private readonly settings: SettingsRepository,
    private readonly audit: AuditLogRepository
  ) {}

  getStatus() {
    this.auth.requireUser();
    const settings = this.settings.getAll();
    const terminals = this.terminals.list();
    const activeTerminal = terminals[0] ?? null;
    return {
      enabled: settings.posIntegrationEnabled === true,
      provider: String(settings.posProvider ?? "local-terminal"),
      connectionMode: String(settings.posConnectionMode ?? "manual"),
      terminalCount: terminals.length,
      activeTerminal,
      latestEvent: this.terminals.latestEvent(activeTerminal?.id)
    };
  }

  listTerminals() {
    this.auth.requireUser();
    return this.terminals.list();
  }

  saveTerminal(input: {
    id?: string;
    terminalCode?: string;
    displayName: string;
    provider: string;
    connectionType: PosConnectionType;
    endpoint?: string | null;
    port?: number | null;
    pairingKey?: string | null;
  }) {
    const user = this.auth.requirePermission("Settings.Manage");
    const terminal = this.terminals.upsert({
      id: input.id,
      terminalCode: input.terminalCode?.trim().toUpperCase() || this.nextTerminalCode(),
      displayName: input.displayName.trim(),
      provider: input.provider.trim() || "local-terminal",
      connectionType: input.connectionType,
      endpoint: input.endpoint?.trim() || null,
      port: input.port ?? null,
      pairingKey: input.pairingKey?.trim() || null,
      actorUserId: user.id
    });
    this.audit.record({ actorUserId: user.id, action: "pos.terminalSaved", entityType: "pos_terminal", entityId: terminal.id, metadata: { terminalCode: terminal.terminalCode, connectionType: terminal.connectionType } });
    return terminal;
  }

  async testConnection(terminalId: string): Promise<PosConnectionResult> {
    const user = this.auth.requirePermission("Settings.Manage");
    const terminal = this.terminals.findById(terminalId);
    if (!terminal) throw new AppError("NOT_FOUND", "POS terminal not found", "POS terminali bulunamadı.");

    const checkedAt = new Date().toISOString();
    if (terminal.connectionType === "manual") {
      this.terminals.recordEvent({ terminalId: terminal.id, eventType: "connection.test", status: "manual", message: "Manuel POS modu aktif; harici bağlantı denenmedi." });
      return { terminal, connected: false, status: "manual", message: "Manuel POS modu aktif. Entegrasyon ayarı kayıtlı, harici bağlantı gerekmiyor.", checkedAt };
    }

    if (terminal.connectionType !== "tcp") {
      const updated = this.terminals.updateStatus({ terminalId: terminal.id, status: "unsupported", lastError: "Bu bağlantı tipi için sürücü adaptörü henüz eklenmedi.", actorUserId: user.id });
      this.terminals.recordEvent({ terminalId: terminal.id, eventType: "connection.test", status: "unsupported", message: updated.lastError, metadata: { connectionType: terminal.connectionType } });
      return { terminal: updated, connected: false, status: "unsupported", message: "Bu bağlantı tipi için sürücü adaptörü henüz eklenmedi.", checkedAt };
    }

    if (!terminal.endpoint || !terminal.port) throw new ValidationError("TCP POS terminal requires endpoint and port", { terminalId });

    try {
      await testTcpConnection({ host: terminal.endpoint, port: terminal.port, timeoutMs: Number(this.settings.getAll().posTimeoutSeconds ?? 10) * 1000 });
      const updated = this.terminals.updateStatus({ terminalId: terminal.id, status: "connected", lastConnectedAt: checkedAt, lastError: null, actorUserId: user.id });
      this.terminals.recordEvent({ terminalId: terminal.id, eventType: "connection.test", status: "connected", message: "POS terminal bağlantısı başarılı.", metadata: { endpoint: terminal.endpoint, port: terminal.port } });
      this.audit.record({ actorUserId: user.id, action: "pos.connectionSucceeded", entityType: "pos_terminal", entityId: terminal.id });
      return { terminal: updated, connected: true, status: "connected", message: "POS terminal bağlantısı başarılı.", checkedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const updated = this.terminals.updateStatus({ terminalId: terminal.id, status: "failed", lastError: message, actorUserId: user.id });
      this.terminals.recordEvent({ terminalId: terminal.id, eventType: "connection.test", status: "failed", message, metadata: { endpoint: terminal.endpoint, port: terminal.port } });
      this.audit.record({ actorUserId: user.id, action: "pos.connectionFailed", entityType: "pos_terminal", entityId: terminal.id, metadata: { message } });
      return { terminal: updated, connected: false, status: "failed", message: "POS terminal bağlantısı kurulamadı.", checkedAt };
    }
  }

  private nextTerminalCode(): string {
    const now = new Date();
    const prefix = `POS${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}-`;
    let sequence = this.terminals.countByDatePrefix(prefix) + 1;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = `${prefix}${String(sequence + attempt).padStart(2, "0")}`;
      if (!this.terminals.existsByCode(candidate)) return candidate;
    }
    throw new AppError("CONFLICT", "Could not allocate POS terminal code", "POS terminal kodu üretilemedi.");
  }
}

function testTcpConnection(input: { host: string; port: number; timeoutMs: number }) {
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: input.host, port: input.port });
    let settled = false;
    const done = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };

    socket.setTimeout(input.timeoutMs, () => done(new Error("POS terminal bağlantısı zaman aşımına uğradı.")));
    socket.once("connect", () => done());
    socket.once("error", (error) => done(error));
  });
}
