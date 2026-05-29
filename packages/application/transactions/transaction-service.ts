import type { AuthService } from "@application/auth/auth-service";
import type { AuditLogRepository } from "@database/repositories/audit-log-repository";
import type { LedgerRepository } from "@database/repositories/ledger-repository";

export class TransactionService {
  constructor(private readonly auth: AuthService, private readonly ledger: LedgerRepository, private readonly audit: AuditLogRepository) {}

  addDebt(input: { customerId: string; amountCents: number; description?: string | null; dueAt?: string | null; idempotencyKey?: string }) {
    const user = this.auth.requirePermission("Transaction.AddDebt");
    const entry = this.ledger.addDebt({ ...input, actorUserId: user.id });
    this.audit.record({ actorUserId: user.id, action: "transaction.debtAdded", entityType: "ledgerEntry", entityId: entry.id, metadata: { customerId: entry.customerId, amountCents: entry.amountCents } });
    return entry;
  }

  receivePayment(input: { customerId: string; amountCents: number; description?: string | null; paymentMethod?: "cash" | "card" | "transfer"; idempotencyKey?: string }) {
    const user = this.auth.requirePermission("Transaction.ReceivePayment");
    const entry = this.ledger.receivePayment({ ...input, actorUserId: user.id });
    this.audit.record({ actorUserId: user.id, action: "transaction.paymentReceived", entityType: "ledgerEntry", entityId: entry.id, metadata: { customerId: entry.customerId, amountCents: entry.amountCents } });
    return entry;
  }

  void(input: { ledgerEntryId: string; reason: string }) {
    const user = this.auth.requirePermission("Transaction.Void");
    return this.ledger.voidLedgerEntry({ ...input, actorUserId: user.id });
  }

  undoLast() {
    const user = this.auth.requirePermission("Transaction.Undo");
    const entry = this.ledger.undoLast(user.id);
    this.audit.record({ actorUserId: user.id, action: "transaction.undoLast", entityType: "ledgerEntry", entityId: entry.id });
    return entry;
  }

  getHistory(limit?: number) {
    this.auth.requireUser();
    return this.ledger.getHistory(limit);
  }
}
