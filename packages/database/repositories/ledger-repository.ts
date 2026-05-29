import type Database from "better-sqlite3";
import type { LedgerEntry } from "@domain/ledger/ledger-types";
import { assertPositiveCents } from "@domain/shared/money";
import { createId, createIdempotencyKey } from "@domain/shared/ids";
import { AppError, ValidationError } from "@shared/errors";

type LedgerRow = { id: string; customer_id: string; event_type: LedgerEntry["eventType"]; direction: LedgerEntry["direction"]; amount_cents: number; description: string | null; occurred_at: string; created_at: string; created_by: string | null; source_transaction_id: string; voids_ledger_entry_id: string | null };
type HistoryRow = LedgerRow & { customer_name: string; actor_name: string | null };
export type LedgerHistoryItem = LedgerEntry & { customerName: string; actorName: string | null };
export type DashboardMetrics = {
  totalReceivableCents: number;
  todayDebtCents: number;
  todayDebtCount: number;
  todayPaymentCents: number;
  todayPaymentCount: number;
  netChangeCents: number;
  totalCustomers: number;
  activeCustomers: number;
  archivedCustomers: number;
  debtorCustomers: number;
  noPaymentThirtyDays: number;
  riskyCustomers: number;
  cashBalanceCents: number;
  debtAging: {
    currentThirtyCents: number;
    thirtyOneSixtyCents: number;
    sixtyOneNinetyCents: number;
    overNinetyCents: number;
  };
  topDebtors: Array<{ customerId: string; displayName: string; balanceCents: number }>;
  cashierActivity: Array<{ userId: string | null; displayName: string; transactionCount: number }>;
  hourlyIntensity: Array<{ hour: number; transactionCount: number }>;
};

export class LedgerRepository {
  constructor(private readonly db: Database.Database) {}

  addDebt(input: { customerId: string; amountCents: number; description?: string | null; dueAt?: string | null; actorUserId: string; idempotencyKey?: string }): LedgerEntry {
    assertPositiveCents(input.amountCents);
    const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey("debt");
    const existing = this.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;
    return this.db.transaction(() => {
      const customer = this.getCustomerBalance(input.customerId);
      const now = new Date().toISOString();
      const transactionId = createId("txn");
      const ledgerEntryId = createId("led");
      const description = input.description?.trim() || "Veresiye borç eklendi";
      const balanceAfter = customer.current_balance_cents + input.amountCents;
      this.insertTransaction(transactionId, input.customerId, "debt", input.amountCents, description, now, idempotencyKey, input.actorUserId);
      this.insertLedgerEntry(ledgerEntryId, input.customerId, "DebtAdded", "debit", input.amountCents, description, now, transactionId, null, idempotencyKey, null, input.actorUserId);
      this.db.prepare("INSERT INTO debts (id, transaction_id, ledger_entry_id, customer_id, amount_cents, due_at, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(createId("dbt"), transactionId, ledgerEntryId, input.customerId, input.amountCents, input.dueAt ?? null, now, now, input.actorUserId, input.actorUserId);
      this.insertTransactionItem(transactionId, "debt", description, input.amountCents, now, input.actorUserId);
      this.insertSnapshot(transactionId, customer.current_balance_cents, balanceAfter, now, input.actorUserId);
      this.updateCustomerBalance(input.customerId, balanceAfter, now, input.actorUserId);
      return this.findById(ledgerEntryId)!;
    })();
  }

  receivePayment(input: { customerId: string; amountCents: number; description?: string | null; paymentMethod?: "cash" | "card" | "transfer"; actorUserId: string; idempotencyKey?: string }): LedgerEntry {
    assertPositiveCents(input.amountCents);
    const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey("pay");
    const existing = this.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;
    return this.db.transaction(() => {
      const customer = this.getCustomerBalance(input.customerId);
      if (input.amountCents > customer.current_balance_cents) throw new ValidationError("Payment cannot exceed current balance", { currentBalanceCents: customer.current_balance_cents, amountCents: input.amountCents });
      const now = new Date().toISOString();
      const transactionId = createId("txn");
      const ledgerEntryId = createId("led");
      const description = input.description?.trim() || "Tahsilat alındı";
      const balanceAfter = customer.current_balance_cents - input.amountCents;
      this.insertTransaction(transactionId, input.customerId, "payment", input.amountCents, description, now, idempotencyKey, input.actorUserId);
      this.insertLedgerEntry(ledgerEntryId, input.customerId, "PaymentReceived", "credit", input.amountCents, description, now, transactionId, null, idempotencyKey, JSON.stringify({ paymentMethod: input.paymentMethod ?? "cash" }), input.actorUserId);
      this.db.prepare("INSERT INTO payments (id, transaction_id, ledger_entry_id, customer_id, amount_cents, payment_method, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(createId("pay"), transactionId, ledgerEntryId, input.customerId, input.amountCents, input.paymentMethod ?? "cash", now, now, input.actorUserId, input.actorUserId);
      this.insertTransactionItem(transactionId, "payment", description, input.amountCents, now, input.actorUserId);
      this.insertSnapshot(transactionId, customer.current_balance_cents, balanceAfter, now, input.actorUserId);
      this.updateCustomerBalance(input.customerId, balanceAfter, now, input.actorUserId);
      return this.findById(ledgerEntryId)!;
    })();
  }

  voidLedgerEntry(input: { ledgerEntryId: string; reason: string; actorUserId: string }): LedgerEntry {
    const reason = input.reason.trim();
    if (reason.length < 3) throw new ValidationError("Void reason is required");
    return this.db.transaction(() => {
      const original = this.findById(input.ledgerEntryId);
      if (!original) throw new AppError("NOT_FOUND", "Ledger entry not found", "İşlem bulunamadı.");
      if (original.eventType === "TransactionVoided" || original.eventType === "BalanceRecalculated") throw new ValidationError("This ledger entry cannot be voided");
      if (this.db.prepare("SELECT id FROM transaction_voids WHERE original_ledger_entry_id = ? AND is_deleted = 0").get(input.ledgerEntryId)) throw new AppError("CONFLICT", "Ledger entry already voided", "Bu işlem daha önce iptal edilmiş.");
      const customer = this.getCustomerBalance(original.customerId);
      const now = new Date().toISOString();
      const transactionId = createId("txn");
      const ledgerEntryId = createId("led");
      const reverseDirection = original.direction === "debit" ? "credit" : original.direction === "credit" ? "debit" : "neutral";
      const balanceAfter = reverseDirection === "debit" ? customer.current_balance_cents + original.amountCents : reverseDirection === "credit" ? customer.current_balance_cents - original.amountCents : customer.current_balance_cents;
      const idempotencyKey = createIdempotencyKey("void");
      this.insertTransaction(transactionId, original.customerId, "void", original.amountCents, reason, now, idempotencyKey, input.actorUserId);
      this.insertLedgerEntry(ledgerEntryId, original.customerId, "TransactionVoided", reverseDirection, original.amountCents, reason, now, transactionId, original.id, idempotencyKey, JSON.stringify({ originalEventType: original.eventType }), input.actorUserId);
      this.db.prepare("INSERT INTO transaction_voids (id, original_ledger_entry_id, void_ledger_entry_id, reason, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(createId("vld"), original.id, ledgerEntryId, reason, now, now, input.actorUserId, input.actorUserId);
      this.insertSnapshot(transactionId, customer.current_balance_cents, balanceAfter, now, input.actorUserId);
      this.updateCustomerBalance(original.customerId, balanceAfter, now, input.actorUserId);
      return this.findById(ledgerEntryId)!;
    })();
  }

  undoLast(actorUserId: string): LedgerEntry {
    const row = this.db.prepare("SELECT le.id FROM ledger_entries le LEFT JOIN transaction_voids tv ON tv.original_ledger_entry_id = le.id AND tv.is_deleted = 0 WHERE le.is_deleted = 0 AND le.event_type NOT IN ('TransactionVoided', 'BalanceRecalculated') AND tv.id IS NULL ORDER BY le.created_at DESC, le.rowid DESC LIMIT 1").get() as { id: string } | undefined;
    if (!row) throw new AppError("NOT_FOUND", "No undoable transaction found", "Geri alınacak işlem bulunamadı.");
    return this.voidLedgerEntry({ ledgerEntryId: row.id, reason: "Son işlem geri alındı", actorUserId });
  }

  findById(ledgerEntryId: string): LedgerEntry | null {
    const row = this.db.prepare("SELECT id, customer_id, event_type, direction, amount_cents, description, occurred_at, created_at, created_by, source_transaction_id, voids_ledger_entry_id FROM ledger_entries WHERE id = ? AND is_deleted = 0").get(ledgerEntryId) as LedgerRow | undefined;
    return row ? mapLedger(row) : null;
  }

  getHistory(limit = 25): LedgerHistoryItem[] {
    const rows = this.db.prepare("SELECT le.id, le.customer_id, le.event_type, le.direction, le.amount_cents, le.description, le.occurred_at, le.created_at, le.created_by, le.source_transaction_id, le.voids_ledger_entry_id, c.display_name AS customer_name, u.display_name AS actor_name FROM ledger_entries le JOIN customers c ON c.id = le.customer_id LEFT JOIN users u ON u.id = le.created_by WHERE le.is_deleted = 0 ORDER BY le.occurred_at DESC, le.rowid DESC LIMIT ?").all(Math.min(limit, 200)) as HistoryRow[];
    return rows.map((row) => ({ ...mapLedger(row), customerName: row.customer_name, actorName: row.actor_name }));
  }

  getDashboardMetrics(todayStartIso: string, todayEndIso: string, thirtyDaysAgoIso: string): DashboardMetrics {
    const total = this.sum("1 = 1", []);
    const todayDebt = this.sum("direction = 'debit' AND occurred_at >= ? AND occurred_at < ?", [todayStartIso, todayEndIso]);
    const todayPayment = Math.abs(this.sum("direction = 'credit' AND event_type = 'PaymentReceived' AND occurred_at >= ? AND occurred_at < ?", [todayStartIso, todayEndIso]));
    const todayDebtCount = this.countLedger("direction = 'debit' AND occurred_at >= ? AND occurred_at < ?", [todayStartIso, todayEndIso]);
    const todayPaymentCount = this.countLedger("direction = 'credit' AND event_type = 'PaymentReceived' AND occurred_at >= ? AND occurred_at < ?", [todayStartIso, todayEndIso]);
    const stats = this.db.prepare("SELECT COUNT(*) AS totalCustomers, SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS activeCustomers, SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) AS archivedCustomers, SUM(CASE WHEN is_deleted = 0 AND current_balance_cents > 0 THEN 1 ELSE 0 END) AS debtorCustomers, SUM(CASE WHEN is_deleted = 0 AND risk_status IN ('watch','blocked') THEN 1 ELSE 0 END) AS riskyCustomers FROM customers").get() as { totalCustomers: number; activeCustomers: number | null; archivedCustomers: number | null; debtorCustomers: number | null; riskyCustomers: number | null };
    const noPayment = this.db.prepare("SELECT COUNT(*) AS count FROM customers c WHERE c.is_deleted = 0 AND c.current_balance_cents > 0 AND NOT EXISTS (SELECT 1 FROM ledger_entries le WHERE le.customer_id = c.id AND le.event_type = 'PaymentReceived' AND le.occurred_at >= ? AND le.is_deleted = 0)").get(thirtyDaysAgoIso) as { count: number };
    const topDebtors = this.db.prepare("SELECT id AS customerId, display_name AS displayName, current_balance_cents AS balanceCents FROM customers WHERE is_deleted = 0 AND current_balance_cents > 0 ORDER BY current_balance_cents DESC, display_name ASC LIMIT 10").all() as DashboardMetrics["topDebtors"];
    const cashierActivity = this.db.prepare("SELECT le.created_by AS userId, COALESCE(u.display_name, 'Sistem') AS displayName, COUNT(*) AS transactionCount FROM ledger_entries le LEFT JOIN users u ON u.id = le.created_by WHERE le.is_deleted = 0 AND le.occurred_at >= ? AND le.occurred_at < ? GROUP BY le.created_by, u.display_name ORDER BY transactionCount DESC LIMIT 8").all(todayStartIso, todayEndIso) as DashboardMetrics["cashierActivity"];
    const hourlyIntensity = this.db.prepare("SELECT CAST(strftime('%H', occurred_at) AS INTEGER) AS hour, COUNT(*) AS transactionCount FROM ledger_entries WHERE is_deleted = 0 AND occurred_at >= ? AND occurred_at < ? GROUP BY hour ORDER BY hour ASC").all(todayStartIso, todayEndIso) as DashboardMetrics["hourlyIntensity"];
    const aging = this.db.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN last_ledger_at IS NULL OR last_ledger_at >= datetime('now', '-30 days') THEN current_balance_cents ELSE 0 END), 0) AS currentThirtyCents,
         COALESCE(SUM(CASE WHEN last_ledger_at < datetime('now', '-30 days') AND last_ledger_at >= datetime('now', '-60 days') THEN current_balance_cents ELSE 0 END), 0) AS thirtyOneSixtyCents,
         COALESCE(SUM(CASE WHEN last_ledger_at < datetime('now', '-60 days') AND last_ledger_at >= datetime('now', '-90 days') THEN current_balance_cents ELSE 0 END), 0) AS sixtyOneNinetyCents,
         COALESCE(SUM(CASE WHEN last_ledger_at < datetime('now', '-90 days') THEN current_balance_cents ELSE 0 END), 0) AS overNinetyCents
       FROM customers
       WHERE is_deleted = 0 AND current_balance_cents > 0`
    ).get() as DashboardMetrics["debtAging"];
    return {
      totalReceivableCents: total,
      todayDebtCents: todayDebt,
      todayDebtCount,
      todayPaymentCents: todayPayment,
      todayPaymentCount,
      netChangeCents: todayDebt - todayPayment,
      totalCustomers: stats.totalCustomers,
      activeCustomers: stats.activeCustomers ?? 0,
      archivedCustomers: stats.archivedCustomers ?? 0,
      debtorCustomers: stats.debtorCustomers ?? 0,
      noPaymentThirtyDays: noPayment.count,
      riskyCustomers: stats.riskyCustomers ?? 0,
      cashBalanceCents: todayPayment,
      debtAging: aging,
      topDebtors,
      cashierActivity,
      hourlyIntensity
    };
  }

  private getCustomerBalance(customerId: string) {
    const row = this.db.prepare("SELECT id, current_balance_cents FROM customers WHERE id = ? AND is_deleted = 0").get(customerId) as { id: string; current_balance_cents: number } | undefined;
    if (!row) throw new AppError("NOT_FOUND", "Customer not found", "Cari bulunamadı.");
    return row;
  }

  private findByIdempotencyKey(idempotencyKey: string): LedgerEntry | null {
    const row = this.db.prepare("SELECT id, customer_id, event_type, direction, amount_cents, description, occurred_at, created_at, created_by, source_transaction_id, voids_ledger_entry_id FROM ledger_entries WHERE idempotency_key = ? AND is_deleted = 0").get(idempotencyKey) as LedgerRow | undefined;
    return row ? mapLedger(row) : null;
  }

  private insertTransaction(id: string, customerId: string, type: string, amount: number, description: string, now: string, idempotencyKey: string, actor: string): void {
    this.db.prepare("INSERT INTO transactions (id, customer_id, transaction_type, total_amount_cents, description, occurred_at, idempotency_key, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, customerId, type, amount, description, now, idempotencyKey, now, now, actor, actor);
  }

  private insertLedgerEntry(id: string, customerId: string, eventType: LedgerEntry["eventType"], direction: LedgerEntry["direction"], amount: number, description: string, now: string, transactionId: string, voidsId: string | null, idempotencyKey: string, metadata: string | null, actor: string): void {
    this.db.prepare("INSERT INTO ledger_entries (id, customer_id, event_type, direction, amount_cents, description, occurred_at, source_transaction_id, voids_ledger_entry_id, idempotency_key, metadata_json, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, customerId, eventType, direction, amount, description, now, transactionId, voidsId, idempotencyKey, metadata, now, now, actor, actor);
  }

  private insertTransactionItem(transactionId: string, type: string, label: string, amount: number, now: string, actor: string): void {
    this.db.prepare("INSERT INTO transaction_items (id, transaction_id, item_type, label, quantity, unit_amount_cents, total_amount_cents, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)").run(createId("itm"), transactionId, type, label, amount, amount, now, now, actor, actor);
  }

  private insertSnapshot(transactionId: string, before: number, after: number, now: string, actor: string): void {
    this.db.prepare("INSERT INTO transaction_snapshots (id, transaction_id, customer_balance_before_cents, customer_balance_after_cents, payload_json, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(createId("snp"), transactionId, before, after, JSON.stringify({ balanceBeforeCents: before, balanceAfterCents: after }), now, now, actor, actor);
  }

  private updateCustomerBalance(customerId: string, balance: number, now: string, actor: string): void {
    this.db.prepare("UPDATE customers SET current_balance_cents = ?, last_ledger_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(balance, now, now, actor, customerId);
  }

  private sum(where: string, params: unknown[]): number {
    return (this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents WHEN direction = 'credit' THEN -amount_cents ELSE 0 END), 0) AS amount FROM ledger_entries WHERE is_deleted = 0 AND ${where}`).get(...params) as { amount: number }).amount;
  }

  private countLedger(where: string, params: unknown[]): number {
    return (this.db.prepare(`SELECT COUNT(*) AS count FROM ledger_entries WHERE is_deleted = 0 AND ${where}`).get(...params) as { count: number }).count;
  }
}

function mapLedger(row: LedgerRow): LedgerEntry {
  return { id: row.id, customerId: row.customer_id, eventType: row.event_type, direction: row.direction, amountCents: row.amount_cents, description: row.description, occurredAt: row.occurred_at, createdAt: row.created_at, createdBy: row.created_by, sourceTransactionId: row.source_transaction_id, voidsLedgerEntryId: row.voids_ledger_entry_id };
}
