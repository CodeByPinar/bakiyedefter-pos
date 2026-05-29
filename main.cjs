"use strict";
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const nanoid = require("nanoid");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const net = require("node:net");
const os = require("node:os");
const zod = require("zod");
function createId(prefix) {
  return `${prefix}_${nanoid.nanoid(18)}`;
}
function createIdempotencyKey(prefix) {
  return `${prefix}_${nanoid.nanoid(24)}`;
}
class AuditLogRepository {
  constructor(db) {
    this.db = db;
  }
  db;
  record(input) {
    this.db.prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(createId("aud"), input.actorUserId ?? null, input.action, input.entityType, input.entityId ?? null, input.metadata ? JSON.stringify(input.metadata) : null, (/* @__PURE__ */ new Date()).toISOString());
  }
}
class BackupHistoryRepository {
  constructor(db) {
    this.db = db;
  }
  db;
  recordCreated(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = createId("bak");
    this.db.prepare("INSERT INTO backup_history (id, path, size_bytes, checksum, status, backup_type, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, 'created', ?, ?, ?, ?, ?)").run(id, input.path, input.sizeBytes, input.checksum, input.backupType, now, now, input.actorUserId, input.actorUserId);
    return this.findById(id);
  }
  markVerified(id) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare("UPDATE backup_history SET status = 'verified', verified_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
    return this.findById(id);
  }
  list(limit = 50) {
    const rows = this.db.prepare("SELECT id, path, size_bytes, checksum, status, backup_type, verified_at, created_at, created_by FROM backup_history WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT ?").all(Math.min(limit, 200));
    return rows.map(mapBackup);
  }
  latest() {
    const row = this.db.prepare("SELECT id, path, size_bytes, checksum, status, backup_type, verified_at, created_at, created_by FROM backup_history WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 1").get();
    return row ? mapBackup(row) : null;
  }
  findById(id) {
    const row = this.db.prepare("SELECT id, path, size_bytes, checksum, status, backup_type, verified_at, created_at, created_by FROM backup_history WHERE id = ? AND is_deleted = 0").get(id);
    return row ? mapBackup(row) : null;
  }
}
function mapBackup(row) {
  return { id: row.id, path: row.path, sizeBytes: row.size_bytes, checksum: row.checksum, status: row.status, backupType: row.backup_type, verifiedAt: row.verified_at, createdAt: row.created_at, createdBy: row.created_by };
}
const trMap = { ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i", ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u" };
function normalizeForSearch(value) {
  return value.split("").map((char) => trMap[char] ?? char).join("").toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function normalizePhone(value) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  if (digits.startsWith("90") && digits.length === 12) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function buildCustomerCode(input) {
  const day = pad2(input.createdAt.getDate());
  const month = pad2(input.createdAt.getMonth() + 1);
  const namePart = customerNamePart(input.displayName);
  const sequencePart = toBase36(input.sequence, 2);
  const body = `CR${day}${month}-${namePart}${sequencePart}`;
  return `${body}K${checksum(body)}`;
}
function customerCodeDatePrefix(createdAt) {
  return `CR${pad2(createdAt.getDate())}${pad2(createdAt.getMonth() + 1)}-`;
}
function customerNamePart(displayName2) {
  const normalized = normalizeForSearch(displayName2).toUpperCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`;
  const compact = (words[0] ?? "CR").replace(/[^A-Z0-9]/g, "");
  return `${compact}XX`.slice(0, 2);
}
function checksum(value) {
  let total = 0;
  for (const char of value) total = (total + char.charCodeAt(0) * 17) % 1296;
  return toBase36(total, 2);
}
function toBase36(value, width) {
  let current = Math.max(0, value);
  let output = "";
  do {
    output = alphabet[current % alphabet.length] + output;
    current = Math.floor(current / alphabet.length);
  } while (current > 0);
  return output.padStart(width, "0").slice(-width);
}
function pad2(value) {
  return String(value).padStart(2, "0");
}
class AppError extends Error {
  constructor(code, message, userMessage = message, details) {
    super(message);
    this.code = code;
    this.userMessage = userMessage;
    this.details = details;
    this.name = new.target.name;
  }
  code;
  userMessage;
  details;
}
class ValidationError extends AppError {
  constructor(message, details) {
    super("VALIDATION_ERROR", message, "Bilgiler kontrol edilemedi. Lütfen alanları gözden geçirin.", details);
  }
}
class AuthError extends AppError {
  constructor(message = "Authentication failed", userMessage = "Giriş yapılamadı. Bilgileri kontrol edin.") {
    super("AUTH_ERROR", message, userMessage);
  }
}
class PermissionError extends AppError {
  constructor(permission) {
    super("PERMISSION_ERROR", `Missing permission: ${permission}`, "Bu işlem için yetkiniz yok.", { permission });
  }
}
class DatabaseError extends AppError {
  constructor(message, details) {
    super("DATABASE_ERROR", message, "İşlem kaydedilemedi. Lütfen tekrar deneyin.", details);
  }
}
class BackupError extends AppError {
  constructor(message, details) {
    super("BACKUP_ERROR", message, "Yedekleme işlemi tamamlanamadı.", details);
  }
}
class PrinterError extends AppError {
  constructor(message, details) {
    super("PRINTER_ERROR", message, "Yazdırma işlemi tamamlanamadı.", details);
  }
}
function normalizeUnknownError(error) {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.userMessage, details: error.details } };
  }
  return {
    ok: false,
    error: {
      code: "UNKNOWN",
      message: "Beklenmeyen bir hata oluştu.",
      details: { message: error instanceof Error ? error.message : String(error) }
    }
  };
}
class CustomerRepository {
  constructor(db) {
    this.db = db;
  }
  db;
  create(input) {
    const displayName2 = input.displayName.trim();
    if (displayName2.length < 2) throw new ValidationError("Customer display name is too short");
    const creditLimitCents = normalizeCreditLimit(input.creditLimitCents);
    const paymentTermsDays = normalizePaymentTerms(input.paymentTermsDays);
    const createdAt = /* @__PURE__ */ new Date();
    const now = createdAt.toISOString();
    const id = createId("cus");
    const customerCode = this.nextCustomerCode(displayName2, createdAt);
    this.db.prepare("INSERT INTO customers (id, customer_code, display_name, normalized_name, phone, normalized_phone, note, risk_status, credit_limit_cents, payment_terms_days, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, customerCode, displayName2, normalizeForSearch(displayName2), input.phone?.trim() || null, normalizePhone(input.phone), input.note?.trim() || null, input.riskStatus ?? "standard", creditLimitCents, paymentTermsDays, now, now, input.actorUserId, input.actorUserId);
    return this.getById(id);
  }
  update(input) {
    const existing = this.getById(input.customerId);
    if (!existing) throw new AppError("NOT_FOUND", "Customer not found", "Cari bulunamadı.");
    const displayName2 = input.displayName.trim();
    if (displayName2.length < 2) throw new ValidationError("Customer display name is too short");
    const creditLimitCents = input.creditLimitCents === void 0 ? existing.creditLimitCents : normalizeCreditLimit(input.creditLimitCents);
    const paymentTermsDays = input.paymentTermsDays === void 0 ? existing.paymentTermsDays : normalizePaymentTerms(input.paymentTermsDays);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare("UPDATE customers SET display_name = ?, normalized_name = ?, phone = ?, normalized_phone = ?, note = ?, risk_status = ?, credit_limit_cents = ?, payment_terms_days = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND is_deleted = 0").run(displayName2, normalizeForSearch(displayName2), input.phone?.trim() || null, normalizePhone(input.phone), input.note?.trim() || null, input.riskStatus ?? existing.riskStatus, creditLimitCents, paymentTermsDays, now, input.actorUserId, input.customerId);
    return this.getById(input.customerId);
  }
  archive(customerId, actorUserId) {
    const existing = this.getById(customerId);
    if (!existing) throw new AppError("NOT_FOUND", "Customer not found", "Cari bulunamadı.");
    if (existing.currentBalanceCents !== 0) throw new ValidationError("Customers with non-zero balance cannot be archived", { customerId });
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare("UPDATE customers SET is_deleted = 1, deleted_at = ?, archived_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(now, now, now, actorUserId, customerId);
  }
  getById(customerId) {
    const row = this.db.prepare(baseCustomerSelect("WHERE id = ? AND is_deleted = 0")).get(customerId);
    return row ? mapCustomer(row) : null;
  }
  search(params) {
    const clauses = ["c.is_deleted = 0"];
    const values = [];
    const query = normalizeForSearch(params.query ?? "");
    if (query) {
      clauses.push("(c.normalized_name LIKE ? OR c.normalized_phone LIKE ? OR c.customer_code LIKE ? OR REPLACE(c.customer_code, '-', '') LIKE ?)");
      values.push(`%${query}%`, `%${query.replace(/\s/g, "")}%`, `%${query.replace(/\s/g, "").toUpperCase()}%`, `%${query.replace(/\s/g, "").toUpperCase()}%`);
    }
    if (params.onlyDebtors) clauses.push("c.current_balance_cents > 0");
    const orderBy = orderBySql(params.sortBy);
    const rows = this.db.prepare(
      `SELECT
           c.id,
           c.customer_code,
           c.display_name,
           c.phone,
           c.normalized_phone,
           c.note,
           c.risk_status,
           c.credit_limit_cents,
           c.payment_terms_days,
           c.last_contacted_at,
           c.current_balance_cents,
           c.last_ledger_at,
           c.created_at,
           c.updated_at,
           MAX(CASE WHEN le.event_type = 'PaymentReceived' THEN le.occurred_at ELSE NULL END) AS last_payment_at,
           SUM(CASE WHEN le.event_type = 'DebtAdded' THEN 1 ELSE 0 END) AS debt_entry_count,
           SUM(CASE WHEN le.event_type = 'PaymentReceived' THEN 1 ELSE 0 END) AS payment_entry_count,
           COALESCE(SUM(CASE WHEN le.event_type = 'DebtAdded' AND le.occurred_at < datetime('now', '-' || c.payment_terms_days || ' days') THEN le.amount_cents ELSE 0 END), 0) AS overdue_debt_cents
         FROM customers c
         LEFT JOIN ledger_entries le ON le.customer_id = c.id AND le.is_deleted = 0
         WHERE ${clauses.join(" AND ")}
         GROUP BY c.id
         ORDER BY ${orderBy}
         LIMIT ?`
    ).all(...values, Math.min(params.limit ?? 50, 200));
    return rows.map(mapCustomerListItem);
  }
  getLedger(customerId, limit = 100) {
    const rows = this.db.prepare("SELECT id, customer_id, event_type, direction, amount_cents, description, occurred_at, created_at, created_by, source_transaction_id, voids_ledger_entry_id FROM ledger_entries WHERE customer_id = ? AND is_deleted = 0 ORDER BY occurred_at DESC, rowid DESC LIMIT ?").all(customerId, Math.min(limit, 500));
    return rows.map(mapLedger$1);
  }
  nextCustomerCode(displayName2, createdAt) {
    const prefix = customerCodeDatePrefix(createdAt);
    const sequenceRow = this.db.prepare("SELECT COUNT(*) AS count FROM customers WHERE customer_code LIKE ?").get(`${prefix}%`);
    let sequence = sequenceRow.count + 1;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = buildCustomerCode({ displayName: displayName2, createdAt, sequence: sequence + attempt });
      const existing = this.db.prepare("SELECT 1 FROM customers WHERE customer_code = ? LIMIT 1").get(candidate);
      if (!existing) return candidate;
    }
    throw new AppError("CONFLICT", "Could not allocate customer code", "Cari kodu üretilemedi. Lütfen tekrar deneyin.");
  }
}
function baseCustomerSelect(where) {
  return `SELECT id, customer_code, display_name, phone, normalized_phone, note, risk_status, credit_limit_cents, payment_terms_days, last_contacted_at, current_balance_cents, last_ledger_at, created_at, updated_at FROM customers ${where}`;
}
function orderBySql(sortBy) {
  if (sortBy === "balance") return "c.current_balance_cents DESC, c.display_name ASC";
  if (sortBy === "lastLedgerAt") return "c.last_ledger_at DESC NULLS LAST, c.display_name ASC";
  return "c.normalized_name ASC";
}
function mapCustomer(row) {
  return {
    id: row.id,
    customerCode: row.customer_code,
    displayName: row.display_name,
    phone: row.phone,
    normalizedPhone: row.normalized_phone,
    note: row.note,
    riskStatus: row.risk_status,
    creditLimitCents: row.credit_limit_cents,
    paymentTermsDays: row.payment_terms_days,
    lastContactedAt: row.last_contacted_at,
    currentBalanceCents: row.current_balance_cents,
    lastLedgerAt: row.last_ledger_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function mapCustomerListItem(row) {
  const customer = mapCustomer(row);
  return {
    ...customer,
    lastPaymentAt: row.last_payment_at,
    debtEntryCount: row.debt_entry_count ?? 0,
    paymentEntryCount: row.payment_entry_count ?? 0,
    overdueDebtCents: row.overdue_debt_cents ?? 0,
    creditUsagePercent: customer.creditLimitCents > 0 ? Math.round(customer.currentBalanceCents / customer.creditLimitCents * 100) : null
  };
}
function mapLedger$1(row) {
  return { id: row.id, customerId: row.customer_id, eventType: row.event_type, direction: row.direction, amountCents: row.amount_cents, description: row.description, occurredAt: row.occurred_at, createdAt: row.created_at, createdBy: row.created_by, sourceTransactionId: row.source_transaction_id, voidsLedgerEntryId: row.voids_ledger_entry_id };
}
function normalizeCreditLimit(value) {
  if (value === void 0) return 0;
  if (!Number.isInteger(value) || value < 0) throw new ValidationError("Credit limit must be a non-negative integer");
  return value;
}
function normalizePaymentTerms(value) {
  if (value === void 0) return 30;
  if (!Number.isInteger(value) || value < 0 || value > 365) throw new ValidationError("Payment terms must be between 0 and 365 days");
  return value;
}
class DeviceRepository {
  constructor(db) {
    this.db = db;
  }
  db;
  remember(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existing = this.findLatestByName(input.deviceName);
    if (existing) {
      this.db.prepare("UPDATE devices SET remembered = 1, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(now, input.actorUserId, existing.id);
      return this.findById(existing.id);
    }
    const id = createId("dev");
    this.db.prepare("INSERT INTO devices (id, device_name, remembered, created_at, updated_at, created_by, updated_by) VALUES (?, ?, 1, ?, ?, ?, ?)").run(id, input.deviceName, now, now, input.actorUserId, input.actorUserId);
    return this.findById(id);
  }
  findLatestByName(deviceName) {
    const row = this.db.prepare("SELECT id, device_name, remembered, updated_at FROM devices WHERE device_name = ? AND is_deleted = 0 ORDER BY updated_at DESC LIMIT 1").get(deviceName);
    return row ? mapDevice(row) : null;
  }
  findById(id) {
    const row = this.db.prepare("SELECT id, device_name, remembered, updated_at FROM devices WHERE id = ? AND is_deleted = 0").get(id);
    return row ? mapDevice(row) : null;
  }
}
function mapDevice(row) {
  return { id: row.id, deviceName: row.device_name, remembered: row.remembered === 1, updatedAt: row.updated_at };
}
function assertPositiveCents(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError("Amount must be positive", { amountCents });
  }
}
class LedgerRepository {
  constructor(db) {
    this.db = db;
  }
  db;
  addDebt(input) {
    assertPositiveCents(input.amountCents);
    const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey("debt");
    const existing = this.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;
    return this.db.transaction(() => {
      const customer = this.getCustomerBalance(input.customerId);
      const now = (/* @__PURE__ */ new Date()).toISOString();
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
      return this.findById(ledgerEntryId);
    })();
  }
  receivePayment(input) {
    assertPositiveCents(input.amountCents);
    const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey("pay");
    const existing = this.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;
    return this.db.transaction(() => {
      const customer = this.getCustomerBalance(input.customerId);
      if (input.amountCents > customer.current_balance_cents) throw new ValidationError("Payment cannot exceed current balance", { currentBalanceCents: customer.current_balance_cents, amountCents: input.amountCents });
      const now = (/* @__PURE__ */ new Date()).toISOString();
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
      return this.findById(ledgerEntryId);
    })();
  }
  voidLedgerEntry(input) {
    const reason = input.reason.trim();
    if (reason.length < 3) throw new ValidationError("Void reason is required");
    return this.db.transaction(() => {
      const original = this.findById(input.ledgerEntryId);
      if (!original) throw new AppError("NOT_FOUND", "Ledger entry not found", "İşlem bulunamadı.");
      if (original.eventType === "TransactionVoided" || original.eventType === "BalanceRecalculated") throw new ValidationError("This ledger entry cannot be voided");
      if (this.db.prepare("SELECT id FROM transaction_voids WHERE original_ledger_entry_id = ? AND is_deleted = 0").get(input.ledgerEntryId)) throw new AppError("CONFLICT", "Ledger entry already voided", "Bu işlem daha önce iptal edilmiş.");
      const customer = this.getCustomerBalance(original.customerId);
      const now = (/* @__PURE__ */ new Date()).toISOString();
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
      return this.findById(ledgerEntryId);
    })();
  }
  undoLast(actorUserId) {
    const row = this.db.prepare("SELECT le.id FROM ledger_entries le LEFT JOIN transaction_voids tv ON tv.original_ledger_entry_id = le.id AND tv.is_deleted = 0 WHERE le.is_deleted = 0 AND le.event_type NOT IN ('TransactionVoided', 'BalanceRecalculated') AND tv.id IS NULL ORDER BY le.created_at DESC, le.rowid DESC LIMIT 1").get();
    if (!row) throw new AppError("NOT_FOUND", "No undoable transaction found", "Geri alınacak işlem bulunamadı.");
    return this.voidLedgerEntry({ ledgerEntryId: row.id, reason: "Son işlem geri alındı", actorUserId });
  }
  findById(ledgerEntryId) {
    const row = this.db.prepare("SELECT id, customer_id, event_type, direction, amount_cents, description, occurred_at, created_at, created_by, source_transaction_id, voids_ledger_entry_id FROM ledger_entries WHERE id = ? AND is_deleted = 0").get(ledgerEntryId);
    return row ? mapLedger(row) : null;
  }
  getHistory(limit = 25) {
    const rows = this.db.prepare("SELECT le.id, le.customer_id, le.event_type, le.direction, le.amount_cents, le.description, le.occurred_at, le.created_at, le.created_by, le.source_transaction_id, le.voids_ledger_entry_id, c.display_name AS customer_name, u.display_name AS actor_name FROM ledger_entries le JOIN customers c ON c.id = le.customer_id LEFT JOIN users u ON u.id = le.created_by WHERE le.is_deleted = 0 ORDER BY le.occurred_at DESC, le.rowid DESC LIMIT ?").all(Math.min(limit, 200));
    return rows.map((row) => ({ ...mapLedger(row), customerName: row.customer_name, actorName: row.actor_name }));
  }
  getDashboardMetrics(todayStartIso, todayEndIso, thirtyDaysAgoIso) {
    const total = this.sum("1 = 1", []);
    const todayDebt = this.sum("direction = 'debit' AND occurred_at >= ? AND occurred_at < ?", [todayStartIso, todayEndIso]);
    const todayPayment = Math.abs(this.sum("direction = 'credit' AND event_type = 'PaymentReceived' AND occurred_at >= ? AND occurred_at < ?", [todayStartIso, todayEndIso]));
    const todayDebtCount = this.countLedger("direction = 'debit' AND occurred_at >= ? AND occurred_at < ?", [todayStartIso, todayEndIso]);
    const todayPaymentCount = this.countLedger("direction = 'credit' AND event_type = 'PaymentReceived' AND occurred_at >= ? AND occurred_at < ?", [todayStartIso, todayEndIso]);
    const stats = this.db.prepare("SELECT COUNT(*) AS totalCustomers, SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS activeCustomers, SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) AS archivedCustomers, SUM(CASE WHEN is_deleted = 0 AND current_balance_cents > 0 THEN 1 ELSE 0 END) AS debtorCustomers, SUM(CASE WHEN is_deleted = 0 AND risk_status IN ('watch','blocked') THEN 1 ELSE 0 END) AS riskyCustomers FROM customers").get();
    const noPayment = this.db.prepare("SELECT COUNT(*) AS count FROM customers c WHERE c.is_deleted = 0 AND c.current_balance_cents > 0 AND NOT EXISTS (SELECT 1 FROM ledger_entries le WHERE le.customer_id = c.id AND le.event_type = 'PaymentReceived' AND le.occurred_at >= ? AND le.is_deleted = 0)").get(thirtyDaysAgoIso);
    const topDebtors = this.db.prepare("SELECT id AS customerId, display_name AS displayName, current_balance_cents AS balanceCents FROM customers WHERE is_deleted = 0 AND current_balance_cents > 0 ORDER BY current_balance_cents DESC, display_name ASC LIMIT 10").all();
    const cashierActivity = this.db.prepare("SELECT le.created_by AS userId, COALESCE(u.display_name, 'Sistem') AS displayName, COUNT(*) AS transactionCount FROM ledger_entries le LEFT JOIN users u ON u.id = le.created_by WHERE le.is_deleted = 0 AND le.occurred_at >= ? AND le.occurred_at < ? GROUP BY le.created_by, u.display_name ORDER BY transactionCount DESC LIMIT 8").all(todayStartIso, todayEndIso);
    const hourlyIntensity = this.db.prepare("SELECT CAST(strftime('%H', occurred_at) AS INTEGER) AS hour, COUNT(*) AS transactionCount FROM ledger_entries WHERE is_deleted = 0 AND occurred_at >= ? AND occurred_at < ? GROUP BY hour ORDER BY hour ASC").all(todayStartIso, todayEndIso);
    const aging = this.db.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN last_ledger_at IS NULL OR last_ledger_at >= datetime('now', '-30 days') THEN current_balance_cents ELSE 0 END), 0) AS currentThirtyCents,
         COALESCE(SUM(CASE WHEN last_ledger_at < datetime('now', '-30 days') AND last_ledger_at >= datetime('now', '-60 days') THEN current_balance_cents ELSE 0 END), 0) AS thirtyOneSixtyCents,
         COALESCE(SUM(CASE WHEN last_ledger_at < datetime('now', '-60 days') AND last_ledger_at >= datetime('now', '-90 days') THEN current_balance_cents ELSE 0 END), 0) AS sixtyOneNinetyCents,
         COALESCE(SUM(CASE WHEN last_ledger_at < datetime('now', '-90 days') THEN current_balance_cents ELSE 0 END), 0) AS overNinetyCents
       FROM customers
       WHERE is_deleted = 0 AND current_balance_cents > 0`
    ).get();
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
  getCustomerBalance(customerId) {
    const row = this.db.prepare("SELECT id, current_balance_cents FROM customers WHERE id = ? AND is_deleted = 0").get(customerId);
    if (!row) throw new AppError("NOT_FOUND", "Customer not found", "Cari bulunamadı.");
    return row;
  }
  findByIdempotencyKey(idempotencyKey) {
    const row = this.db.prepare("SELECT id, customer_id, event_type, direction, amount_cents, description, occurred_at, created_at, created_by, source_transaction_id, voids_ledger_entry_id FROM ledger_entries WHERE idempotency_key = ? AND is_deleted = 0").get(idempotencyKey);
    return row ? mapLedger(row) : null;
  }
  insertTransaction(id, customerId, type, amount, description, now, idempotencyKey, actor) {
    this.db.prepare("INSERT INTO transactions (id, customer_id, transaction_type, total_amount_cents, description, occurred_at, idempotency_key, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, customerId, type, amount, description, now, idempotencyKey, now, now, actor, actor);
  }
  insertLedgerEntry(id, customerId, eventType, direction, amount, description, now, transactionId, voidsId, idempotencyKey, metadata, actor) {
    this.db.prepare("INSERT INTO ledger_entries (id, customer_id, event_type, direction, amount_cents, description, occurred_at, source_transaction_id, voids_ledger_entry_id, idempotency_key, metadata_json, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, customerId, eventType, direction, amount, description, now, transactionId, voidsId, idempotencyKey, metadata, now, now, actor, actor);
  }
  insertTransactionItem(transactionId, type, label, amount, now, actor) {
    this.db.prepare("INSERT INTO transaction_items (id, transaction_id, item_type, label, quantity, unit_amount_cents, total_amount_cents, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)").run(createId("itm"), transactionId, type, label, amount, amount, now, now, actor, actor);
  }
  insertSnapshot(transactionId, before, after, now, actor) {
    this.db.prepare("INSERT INTO transaction_snapshots (id, transaction_id, customer_balance_before_cents, customer_balance_after_cents, payload_json, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(createId("snp"), transactionId, before, after, JSON.stringify({ balanceBeforeCents: before, balanceAfterCents: after }), now, now, actor, actor);
  }
  updateCustomerBalance(customerId, balance, now, actor) {
    this.db.prepare("UPDATE customers SET current_balance_cents = ?, last_ledger_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(balance, now, now, actor, customerId);
  }
  sum(where, params) {
    return this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents WHEN direction = 'credit' THEN -amount_cents ELSE 0 END), 0) AS amount FROM ledger_entries WHERE is_deleted = 0 AND ${where}`).get(...params).amount;
  }
  countLedger(where, params) {
    return this.db.prepare(`SELECT COUNT(*) AS count FROM ledger_entries WHERE is_deleted = 0 AND ${where}`).get(...params).count;
  }
}
function mapLedger(row) {
  return { id: row.id, customerId: row.customer_id, eventType: row.event_type, direction: row.direction, amountCents: row.amount_cents, description: row.description, occurredAt: row.occurred_at, createdAt: row.created_at, createdBy: row.created_by, sourceTransactionId: row.source_transaction_id, voidsLedgerEntryId: row.voids_ledger_entry_id };
}
class PosTerminalRepository {
  constructor(db) {
    this.db = db;
  }
  db;
  list() {
    const rows = this.db.prepare("SELECT id, terminal_code, display_name, provider, connection_type, endpoint, port, pairing_key, status, last_connected_at, last_error, created_at, updated_at FROM pos_terminals WHERE is_deleted = 0 ORDER BY updated_at DESC, terminal_code ASC").all();
    return rows.map(mapTerminal);
  }
  findById(id) {
    const row = this.db.prepare("SELECT id, terminal_code, display_name, provider, connection_type, endpoint, port, pairing_key, status, last_connected_at, last_error, created_at, updated_at FROM pos_terminals WHERE id = ? AND is_deleted = 0").get(id);
    return row ? mapTerminal(row) : null;
  }
  upsert(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = input.id ?? createId("pos");
    const existing = input.id ? this.findById(input.id) : null;
    if (existing) {
      this.db.prepare(
        "UPDATE pos_terminals SET terminal_code = ?, display_name = ?, provider = ?, connection_type = ?, endpoint = ?, port = ?, pairing_key = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND is_deleted = 0"
      ).run(input.terminalCode, input.displayName, input.provider, input.connectionType, input.endpoint ?? null, input.port ?? null, input.pairingKey ?? null, now, input.actorUserId, id);
      return this.findById(id);
    }
    this.db.prepare(
      "INSERT INTO pos_terminals (id, terminal_code, display_name, provider, connection_type, endpoint, port, pairing_key, status, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inactive', ?, ?, ?, ?)"
    ).run(id, input.terminalCode, input.displayName, input.provider, input.connectionType, input.endpoint ?? null, input.port ?? null, input.pairingKey ?? null, now, now, input.actorUserId, input.actorUserId);
    return this.findById(id);
  }
  updateStatus(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare("UPDATE pos_terminals SET status = ?, last_connected_at = COALESCE(?, last_connected_at), last_error = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND is_deleted = 0").run(input.status, input.lastConnectedAt ?? null, input.lastError ?? null, now, input.actorUserId, input.terminalId);
    return this.findById(input.terminalId);
  }
  recordEvent(input) {
    const id = createId("posevt");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare("INSERT INTO pos_connection_events (id, terminal_id, event_type, status, message, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, input.terminalId ?? null, input.eventType, input.status, input.message ?? null, input.metadata ? JSON.stringify(input.metadata) : null, now);
    return this.findEventById(id);
  }
  latestEvent(terminalId) {
    const row = terminalId ? this.db.prepare("SELECT id, terminal_id, event_type, status, message, metadata_json, created_at FROM pos_connection_events WHERE terminal_id = ? ORDER BY created_at DESC LIMIT 1").get(terminalId) : this.db.prepare("SELECT id, terminal_id, event_type, status, message, metadata_json, created_at FROM pos_connection_events ORDER BY created_at DESC LIMIT 1").get();
    return row ? mapEvent(row) : null;
  }
  countByDatePrefix(prefix) {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM pos_terminals WHERE terminal_code LIKE ?").get(`${prefix}%`);
    return row.count;
  }
  existsByCode(terminalCode) {
    return Boolean(this.db.prepare("SELECT 1 FROM pos_terminals WHERE terminal_code = ? LIMIT 1").get(terminalCode));
  }
  findEventById(id) {
    const row = this.db.prepare("SELECT id, terminal_id, event_type, status, message, metadata_json, created_at FROM pos_connection_events WHERE id = ?").get(id);
    return row ? mapEvent(row) : null;
  }
}
function mapTerminal(row) {
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
function mapEvent(row) {
  return {
    id: row.id,
    terminalId: row.terminal_id,
    eventType: row.event_type,
    status: row.status,
    message: row.message,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    createdAt: row.created_at
  };
}
class PrintJobRepository {
  constructor(db) {
    this.db = db;
  }
  db;
  create(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = createId("prn");
    this.db.prepare("INSERT INTO print_jobs (id, job_type, printer_name, status, payload_json, error_message, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)").run(id, input.jobType, input.printerName ?? null, input.status, input.payload ? JSON.stringify(input.payload) : null, now, now, input.actorUserId ?? null, input.actorUserId ?? null);
    return this.findById(id);
  }
  markStatus(input) {
    this.db.prepare("UPDATE print_jobs SET status = ?, error_message = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(input.status, input.errorMessage ?? null, (/* @__PURE__ */ new Date()).toISOString(), input.actorUserId ?? null, input.printJobId);
  }
  findById(printJobId) {
    const row = this.db.prepare("SELECT id, job_type, printer_name, status, payload_json, error_message, created_at FROM print_jobs WHERE id = ? AND is_deleted = 0").get(printJobId);
    return row ? mapPrintJob(row) : null;
  }
}
function mapPrintJob(row) {
  return {
    id: row.id,
    jobType: row.job_type,
    printerName: row.printer_name,
    status: row.status,
    payloadJson: row.payload_json,
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}
class SettingsRepository {
  constructor(db) {
    this.db = db;
  }
  db;
  getAll() {
    const rows = this.db.prepare("SELECT setting_key, setting_value, value_type FROM app_settings WHERE is_deleted = 0 ORDER BY setting_key ASC").all();
    return Object.fromEntries(rows.map((row) => [row.setting_key, coerce(row)]));
  }
  update(settings, actorUserId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const write = this.db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        const valueType = typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string";
        this.db.prepare("INSERT INTO app_settings (id, setting_key, setting_value, value_type, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, value_type = excluded.value_type, updated_at = excluded.updated_at, updated_by = excluded.updated_by, version = app_settings.version + 1").run(`setting_${key}`, key, String(value), valueType, now, now, actorUserId, actorUserId);
      }
    });
    write();
    return this.getAll();
  }
}
function coerce(row) {
  if (row.value_type === "number") return Number(row.setting_value);
  if (row.value_type === "boolean") return row.setting_value === "true" || row.setting_value === "1";
  if (row.value_type === "json") return JSON.parse(row.setting_value);
  return row.setting_value;
}
class UserRepository {
  constructor(db) {
    this.db = db;
  }
  db;
  countActiveUsers() {
    return this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE is_deleted = 0").get().count;
  }
  findByUsername(username) {
    const row = this.db.prepare("SELECT id, username, display_name, password_hash, pin_hash, role_id, failed_login_count, locked_until FROM users WHERE username = ? AND is_deleted = 0").get(username);
    return row ? mapStoredUser(row) : null;
  }
  findById(userId) {
    const row = this.db.prepare("SELECT id, username, display_name, role_id FROM users WHERE id = ? AND is_deleted = 0").get(userId);
    return row ? { id: row.id, username: row.username, displayName: row.display_name, role: row.role_id, permissions: this.getPermissionsForUser(row.id) } : null;
  }
  createOwner(input) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = createId("usr");
    this.db.prepare("INSERT INTO users (id, username, display_name, password_hash, role_id, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, 'Owner', ?, ?, ?, ?)").run(id, input.username, input.displayName, input.passwordHash, now, now, id, id);
    return this.findById(id);
  }
  markLoginSucceeded(userId) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, userId);
  }
  markLoginFailed(userId, lockedUntil) {
    this.db.prepare("UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = COALESCE(?, locked_until), updated_at = ? WHERE id = ?").run(lockedUntil, (/* @__PURE__ */ new Date()).toISOString(), userId);
  }
  getPermissionsForUser(userId) {
    const rows = this.db.prepare(
      `SELECT DISTINCT permission_id AS permission FROM role_permissions WHERE role_id = (SELECT role_id FROM users WHERE id = ?) AND is_deleted = 0
         UNION SELECT permission_id AS permission FROM user_permissions WHERE user_id = ? AND granted = 1 AND is_deleted = 0`
    ).all(userId, userId);
    return rows.map((row) => row.permission);
  }
}
function mapStoredUser(row) {
  return { id: row.id, username: row.username, displayName: row.display_name, passwordHash: row.password_hash, pinHash: row.pin_hash, role: row.role_id, failedLoginCount: row.failed_login_count, lockedUntil: row.locked_until };
}
const sessionDurationMs = 30 * 60 * 1e3;
class AuthService {
  constructor(users, audit, devices) {
    this.users = users;
    this.audit = audit;
    this.devices = devices;
  }
  users;
  audit;
  devices;
  currentUser = null;
  expiresAt = null;
  getState() {
    if (this.users.countActiveUsers() === 0) return { setupRequired: true, currentUser: null };
    if (this.expiresAt && this.expiresAt <= Date.now()) {
      this.currentUser = null;
      this.expiresAt = null;
    }
    return { setupRequired: false, currentUser: this.currentUser };
  }
  async createFirstOwner(input) {
    if (this.users.countActiveUsers() > 0) throw new AuthError("Owner setup already completed", "İlk kurulum daha önce tamamlanmış.");
    if (input.username.trim().length < 3 || input.displayName.trim().length < 2 || input.password.length < 8) throw new ValidationError("Owner setup fields are invalid");
    const owner = this.users.createOwner({
      username: input.username.trim(),
      displayName: input.displayName.trim(),
      passwordHash: await bcrypt.hash(input.password, 12)
    });
    this.currentUser = owner;
    this.expiresAt = Date.now() + sessionDurationMs;
    this.audit.record({ actorUserId: owner.id, action: "auth.firstOwnerCreated", entityType: "user", entityId: owner.id });
    return owner;
  }
  async login(input) {
    const user = this.users.findByUsername(input.username.trim());
    if (!user) throw new AuthError();
    if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) throw new AuthError("User locked", "Çok fazla hatalı deneme yapıldı. Bir süre sonra tekrar deneyin.");
    if (!await bcrypt.compare(input.password, user.passwordHash)) {
      const failedCount = user.failedLoginCount + 1;
      this.users.markLoginFailed(user.id, failedCount >= 5 ? new Date(Date.now() + 10 * 60 * 1e3).toISOString() : null);
      this.audit.record({ actorUserId: user.id, action: "auth.loginFailed", entityType: "user", entityId: user.id, metadata: { failedCount } });
      throw new AuthError();
    }
    if (input.roleHint && !roleMatchesHint(user.role, input.roleHint)) {
      this.audit.record({
        actorUserId: user.id,
        action: "auth.roleMismatch",
        entityType: "user",
        entityId: user.id,
        metadata: { selectedRole: input.roleHint, actualRole: user.role }
      });
      throw new AuthError("Selected role does not match user", "Seçilen rol bu kullanıcıyla eşleşmiyor.");
    }
    this.users.markLoginSucceeded(user.id);
    const authenticated = this.users.findById(user.id);
    if (!authenticated) throw new AuthError("User disappeared after login");
    this.currentUser = authenticated;
    this.expiresAt = Date.now() + sessionDurationMs;
    if (input.rememberDevice && input.deviceName?.trim()) {
      this.devices.remember({ deviceName: input.deviceName.trim().slice(0, 120), actorUserId: authenticated.id });
    }
    this.audit.record({
      actorUserId: authenticated.id,
      action: "auth.loginSucceeded",
      entityType: "user",
      entityId: authenticated.id,
      metadata: { roleHint: input.roleHint ?? null, rememberDevice: Boolean(input.rememberDevice) }
    });
    return authenticated;
  }
  logout() {
    if (this.currentUser) this.audit.record({ actorUserId: this.currentUser.id, action: "auth.logout", entityType: "user", entityId: this.currentUser.id });
    this.currentUser = null;
    this.expiresAt = null;
  }
  requireUser() {
    const state = this.getState();
    if (state.setupRequired || !state.currentUser) throw new AuthError("No active session", "Oturumunuz kapalı. Lütfen tekrar giriş yapın.");
    this.expiresAt = Date.now() + sessionDurationMs;
    return state.currentUser;
  }
  requirePermission(permission) {
    const user = this.requireUser();
    if (!user.permissions.includes(permission)) throw new PermissionError(permission);
    return user;
  }
}
function roleMatchesHint(role, hint) {
  if (hint === "owner") return role === "Owner" || role === "Admin";
  return role === "Cashier";
}
class BackupService {
  constructor(auth, appDatabase, backupHistory, defaultBackupDir) {
    this.auth = auth;
    this.appDatabase = appDatabase;
    this.backupHistory = backupHistory;
    this.defaultBackupDir = defaultBackupDir;
  }
  auth;
  appDatabase;
  backupHistory;
  defaultBackupDir;
  async createManualBackup(targetDir) {
    const user = this.auth.requirePermission("Backup.Create");
    const backupDir = targetDir?.trim() || this.defaultBackupDir;
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `bakiyedefter-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.db`);
    try {
      await this.appDatabase.handle.backup(backupPath);
      const checksum2 = sha256File(backupPath);
      const record = this.backupHistory.recordCreated({ path: backupPath, sizeBytes: fs.statSync(backupPath).size, checksum: checksum2, backupType: "manual", actorUserId: user.id });
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
function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
function verifySqliteBackup(filePath) {
  const db = new Database(filePath, { readonly: true });
  try {
    const result = db.prepare("PRAGMA integrity_check").get();
    if (result.integrity_check !== "ok") throw new BackupError("Backup integrity check failed", { result: result.integrity_check });
  } finally {
    db.close();
  }
}
class CustomerService {
  constructor(auth, customers, audit) {
    this.auth = auth;
    this.customers = customers;
    this.audit = audit;
  }
  auth;
  customers;
  audit;
  create(input) {
    const user = this.auth.requirePermission("Customer.Create");
    const customer = this.customers.create({ ...input, actorUserId: user.id });
    this.audit.record({ actorUserId: user.id, action: "customer.created", entityType: "customer", entityId: customer.id });
    return customer;
  }
  update(input) {
    const user = this.auth.requirePermission("Customer.Update");
    const customer = this.customers.update({ ...input, actorUserId: user.id });
    this.audit.record({ actorUserId: user.id, action: "customer.updated", entityType: "customer", entityId: customer.id });
    return customer;
  }
  archive(customerId) {
    const user = this.auth.requirePermission("Customer.Archive");
    this.customers.archive(customerId, user.id);
    this.audit.record({ actorUserId: user.id, action: "customer.archived", entityType: "customer", entityId: customerId });
    return { archived: true };
  }
  search(params) {
    this.auth.requireUser();
    return this.customers.search(params);
  }
  getById(customerId) {
    this.auth.requireUser();
    return this.customers.getById(customerId);
  }
  getLedger(customerId) {
    this.auth.requireUser();
    return this.customers.getLedger(customerId);
  }
}
class PosService {
  constructor(auth, terminals, settings, audit) {
    this.auth = auth;
    this.terminals = terminals;
    this.settings = settings;
    this.audit = audit;
  }
  auth;
  terminals;
  settings;
  audit;
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
  saveTerminal(input) {
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
  async testConnection(terminalId) {
    const user = this.auth.requirePermission("Settings.Manage");
    const terminal = this.terminals.findById(terminalId);
    if (!terminal) throw new AppError("NOT_FOUND", "POS terminal not found", "POS terminali bulunamadı.");
    const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
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
      await testTcpConnection({ host: terminal.endpoint, port: terminal.port, timeoutMs: Number(this.settings.getAll().posTimeoutSeconds ?? 10) * 1e3 });
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
  nextTerminalCode() {
    const now = /* @__PURE__ */ new Date();
    const prefix = `POS${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}-`;
    let sequence = this.terminals.countByDatePrefix(prefix) + 1;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = `${prefix}${String(sequence + attempt).padStart(2, "0")}`;
      if (!this.terminals.existsByCode(candidate)) return candidate;
    }
    throw new AppError("CONFLICT", "Could not allocate POS terminal code", "POS terminal kodu üretilemedi.");
  }
}
function testTcpConnection(input) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: input.host, port: input.port });
    let settled = false;
    const done = (error) => {
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
class PrinterService {
  constructor(auth, dashboard, transactions, printJobs, audit) {
    this.auth = auth;
    this.dashboard = dashboard;
    this.transactions = transactions;
    this.printJobs = printJobs;
    this.audit = audit;
  }
  auth;
  dashboard;
  transactions;
  printJobs;
  audit;
  prepareDashboardPrint(input) {
    const user = this.auth.requirePermission("Report.View");
    const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const dashboard = this.dashboard.getDashboard();
    const recentTransactions = this.transactions.getHistory(12);
    const documentTitle = "BakiyeDefter POS - Güncel Özet";
    const job = this.printJobs.create({
      jobType: "dashboard-summary",
      printerName: input.printerName ?? null,
      status: "queued",
      payload: { documentTitle, generatedAt, dashboard, recentTransactions },
      actorUserId: user.id
    });
    this.audit.record({ actorUserId: user.id, action: "printer.dashboardQueued", entityType: "printJob", entityId: job.id });
    return {
      jobId: job.id,
      actorUserId: user.id,
      documentTitle,
      generatedAt,
      printedBy: displayName(user),
      printerName: input.printerName ?? null,
      demoNotice: "Demo sürümü çıktısıdır. Mali belge yerine geçmez.",
      dashboard,
      recentTransactions
    };
  }
  completePrintJob(input) {
    this.printJobs.markStatus({ printJobId: input.printJobId, status: input.status, actorUserId: input.actorUserId });
    this.audit.record({ actorUserId: input.actorUserId, action: `printer.${input.status}`, entityType: "printJob", entityId: input.printJobId, metadata: { printerName: input.printerName ?? null } });
  }
  failPrintJob(input) {
    this.printJobs.markStatus({ printJobId: input.printJobId, status: "failed", errorMessage: input.reason, actorUserId: input.actorUserId });
    this.audit.record({ actorUserId: input.actorUserId, action: "printer.failed", entityType: "printJob", entityId: input.printJobId, metadata: { printerName: input.printerName ?? null, reason: input.reason } });
  }
}
function displayName(user) {
  return user.displayName || user.username;
}
function dayBounds(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
class DashboardQuery {
  constructor(auth, ledger) {
    this.auth = auth;
    this.ledger = ledger;
  }
  auth;
  ledger;
  getDashboard(referenceDate = /* @__PURE__ */ new Date()) {
    this.auth.requirePermission("Report.View");
    const { startIso, endIso } = dayBounds(referenceDate);
    const thirtyDaysAgo = new Date(referenceDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return this.ledger.getDashboardMetrics(startIso, endIso, thirtyDaysAgo.toISOString());
  }
}
class SettingsService {
  constructor(auth, settings) {
    this.auth = auth;
    this.settings = settings;
  }
  auth;
  settings;
  getAll() {
    this.auth.requireUser();
    return this.settings.getAll();
  }
  update(input) {
    const user = this.auth.requirePermission("Settings.Manage");
    return this.settings.update(input, user.id);
  }
}
class SystemHealthService {
  constructor(auth, appDatabase, backups, backupDir, appVersion) {
    this.auth = auth;
    this.appDatabase = appDatabase;
    this.backups = backups;
    this.backupDir = backupDir;
    this.appVersion = appVersion;
  }
  auth;
  appDatabase;
  backups;
  backupDir;
  appVersion;
  getLoginStatus() {
    const latest = this.backups.latest();
    const integrityCheck = this.appDatabase.integrityCheck();
    return {
      databaseReady: integrityCheck === "ok",
      databaseStatus: integrityCheck === "ok" ? "ok" : "failed",
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
      databaseStatus: integrityCheck === "ok" ? "ok" : "failed",
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
  pendingSyncCount() {
    try {
      return this.appDatabase.handle.prepare("SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'pending' AND is_deleted = 0").get().count;
    } catch {
      return 0;
    }
  }
}
function safeFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}
function canAccessFolder(folderPath) {
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    fs.accessSync(folderPath, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
function diskAvailableBytes(folderPath) {
  try {
    const stats = fs.statfsSync(path.parse(path.resolve(folderPath)).root);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}
class TransactionService {
  constructor(auth, ledger, audit) {
    this.auth = auth;
    this.ledger = ledger;
    this.audit = audit;
  }
  auth;
  ledger;
  audit;
  addDebt(input) {
    const user = this.auth.requirePermission("Transaction.AddDebt");
    const entry = this.ledger.addDebt({ ...input, actorUserId: user.id });
    this.audit.record({ actorUserId: user.id, action: "transaction.debtAdded", entityType: "ledgerEntry", entityId: entry.id, metadata: { customerId: entry.customerId, amountCents: entry.amountCents } });
    return entry;
  }
  receivePayment(input) {
    const user = this.auth.requirePermission("Transaction.ReceivePayment");
    const entry = this.ledger.receivePayment({ ...input, actorUserId: user.id });
    this.audit.record({ actorUserId: user.id, action: "transaction.paymentReceived", entityType: "ledgerEntry", entityId: entry.id, metadata: { customerId: entry.customerId, amountCents: entry.amountCents } });
    return entry;
  }
  void(input) {
    const user = this.auth.requirePermission("Transaction.Void");
    return this.ledger.voidLedgerEntry({ ...input, actorUserId: user.id });
  }
  undoLast() {
    const user = this.auth.requirePermission("Transaction.Undo");
    const entry = this.ledger.undoLast(user.id);
    this.audit.record({ actorUserId: user.id, action: "transaction.undoLast", entityType: "ledgerEntry", entityId: entry.id });
    return entry;
  }
  getHistory(limit) {
    this.auth.requireUser();
    return this.ledger.getHistory(limit);
  }
}
function createApplicationServices(input) {
  const audit = new AuditLogRepository(input.database.handle);
  const users = new UserRepository(input.database.handle);
  const customers = new CustomerRepository(input.database.handle);
  const devices = new DeviceRepository(input.database.handle);
  const ledger = new LedgerRepository(input.database.handle);
  const posTerminals = new PosTerminalRepository(input.database.handle);
  const printJobs = new PrintJobRepository(input.database.handle);
  const settings = new SettingsRepository(input.database.handle);
  const backups = new BackupHistoryRepository(input.database.handle);
  const auth = new AuthService(users, audit, devices);
  const backupDir = path.join(input.userDataPath, "backups");
  const transactions = new TransactionService(auth, ledger, audit);
  const dashboard = new DashboardQuery(auth, ledger);
  return {
    auth,
    customers: new CustomerService(auth, customers, audit),
    transactions,
    dashboard,
    backup: new BackupService(auth, input.database, backups, backupDir),
    pos: new PosService(auth, posTerminals, settings, audit),
    printer: new PrinterService(auth, dashboard, transactions, printJobs, audit),
    settings: new SettingsService(auth, settings),
    systemHealth: new SystemHealthService(auth, input.database, backups, backupDir, input.appVersion)
  };
}
const permissions = [
  "Customer.Create",
  "Customer.Update",
  "Customer.Archive",
  "Transaction.AddDebt",
  "Transaction.ReceivePayment",
  "Transaction.Void",
  "Transaction.Undo",
  "Report.View",
  "Report.Export",
  "Backup.Create",
  "Backup.Restore",
  "User.Manage",
  "Settings.Manage"
];
const roles = ["Owner", "Admin", "Cashier", "ReadOnly", "Accountant"];
const rolePermissionMap = {
  Owner: [...permissions],
  Admin: permissions.filter((permission) => permission !== "Backup.Restore"),
  Cashier: ["Customer.Create", "Customer.Update", "Transaction.AddDebt", "Transaction.ReceivePayment", "Transaction.Undo", "Report.View", "Backup.Create"],
  ReadOnly: ["Report.View"],
  Accountant: ["Customer.Create", "Customer.Update", "Transaction.AddDebt", "Transaction.ReceivePayment", "Transaction.Void", "Transaction.Undo", "Report.View", "Report.Export"]
};
const q = (value) => `'${value.replace(/'/g, "''")}'`;
const common = `
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0`;
function simpleTable(name, columns, constraints = "") {
  return `CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${columns}, ${common}${constraints});`;
}
const roleSeeds = roles.map((role) => `INSERT INTO roles (id, name, created_at, updated_at) VALUES (${q(role)}, ${q(role)}, datetime('now'), datetime('now'));`).join("\n");
const permissionSeeds = permissions.map((permission) => `INSERT INTO permissions (id, name, created_at, updated_at) VALUES (${q(permission)}, ${q(permission)}, datetime('now'), datetime('now'));`).join("\n");
const rolePermissionSeeds = Object.entries(rolePermissionMap).flatMap(
  ([role, rolePermissions]) => rolePermissions.map((permission) => `INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at) VALUES (${q(`${role}:${permission}`)}, ${q(role)}, ${q(permission)}, datetime('now'), datetime('now'));`)
).join("\n");
const initialSchema = {
  version: 1,
  name: "initial_schema",
  sql: `
${simpleTable("roles", "name TEXT NOT NULL UNIQUE")}
${simpleTable("permissions", "name TEXT NOT NULL UNIQUE")}
${simpleTable("role_permissions", "role_id TEXT NOT NULL REFERENCES roles(id), permission_id TEXT NOT NULL REFERENCES permissions(id)", ", UNIQUE(role_id, permission_id)")}
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  ${common}
);
${simpleTable("user_permissions", "user_id TEXT NOT NULL REFERENCES users(id), permission_id TEXT NOT NULL REFERENCES permissions(id), granted INTEGER NOT NULL DEFAULT 1", ", UNIQUE(user_id, permission_id)")}
${simpleTable("sessions", "user_id TEXT NOT NULL REFERENCES users(id), device_id TEXT, expires_at TEXT NOT NULL, revoked_at TEXT")}
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  phone TEXT,
  normalized_phone TEXT,
  note TEXT,
  risk_status TEXT NOT NULL DEFAULT 'standard',
  current_balance_cents INTEGER NOT NULL DEFAULT 0,
  last_ledger_at TEXT,
  archived_at TEXT,
  ${common}
);
${simpleTable("customer_contacts", "customer_id TEXT NOT NULL REFERENCES customers(id), contact_type TEXT NOT NULL, value TEXT NOT NULL, normalized_value TEXT")}
${simpleTable("customer_addresses", "customer_id TEXT NOT NULL REFERENCES customers(id), label TEXT NOT NULL, address_line TEXT NOT NULL")}
${simpleTable("customer_notes", "customer_id TEXT NOT NULL REFERENCES customers(id), note TEXT NOT NULL")}
${simpleTable("customer_tags", "name TEXT NOT NULL UNIQUE, color TEXT")}
${simpleTable("customer_tag_links", "customer_id TEXT NOT NULL REFERENCES customers(id), tag_id TEXT NOT NULL REFERENCES customer_tags(id)", ", UNIQUE(customer_id, tag_id)")}
${simpleTable("customer_risk_profiles", "customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id), risk_status TEXT NOT NULL DEFAULT 'standard', risk_note TEXT, last_reviewed_at TEXT")}
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  transaction_type TEXT NOT NULL,
  total_amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted',
  description TEXT,
  occurred_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  ${common}
);
${simpleTable("transaction_items", "transaction_id TEXT NOT NULL REFERENCES transactions(id), item_type TEXT NOT NULL, label TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit_amount_cents INTEGER NOT NULL, total_amount_cents INTEGER NOT NULL")}
${simpleTable("transaction_snapshots", "transaction_id TEXT NOT NULL REFERENCES transactions(id), customer_balance_before_cents INTEGER NOT NULL, customer_balance_after_cents INTEGER NOT NULL, payload_json TEXT NOT NULL")}
${simpleTable("transaction_voids", "original_ledger_entry_id TEXT NOT NULL UNIQUE, void_ledger_entry_id TEXT NOT NULL, reason TEXT NOT NULL")}
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  event_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('debit', 'credit', 'neutral')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  description TEXT,
  occurred_at TEXT NOT NULL,
  source_transaction_id TEXT NOT NULL REFERENCES transactions(id),
  voids_ledger_entry_id TEXT REFERENCES ledger_entries(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT,
  ${common}
);
${simpleTable("payments", "transaction_id TEXT NOT NULL REFERENCES transactions(id), ledger_entry_id TEXT NOT NULL REFERENCES ledger_entries(id), customer_id TEXT NOT NULL REFERENCES customers(id), amount_cents INTEGER NOT NULL, payment_method TEXT NOT NULL DEFAULT 'cash'")}
${simpleTable("debts", "transaction_id TEXT NOT NULL REFERENCES transactions(id), ledger_entry_id TEXT NOT NULL REFERENCES ledger_entries(id), customer_id TEXT NOT NULL REFERENCES customers(id), amount_cents INTEGER NOT NULL, due_at TEXT")}
${simpleTable("products", "name TEXT NOT NULL, barcode TEXT, category_id TEXT, price_cents INTEGER NOT NULL DEFAULT 0")}
${simpleTable("categories", "name TEXT NOT NULL UNIQUE")}
${simpleTable("stock_movements", "product_id TEXT NOT NULL REFERENCES products(id), movement_type TEXT NOT NULL, quantity REAL NOT NULL")}
${simpleTable("reports_cache", "report_key TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL, expires_at TEXT")}
${simpleTable("daily_summaries", "summary_date TEXT NOT NULL UNIQUE, debt_added_cents INTEGER NOT NULL DEFAULT 0, payment_received_cents INTEGER NOT NULL DEFAULT 0")}
${simpleTable("monthly_summaries", "summary_month TEXT NOT NULL UNIQUE, debt_added_cents INTEGER NOT NULL DEFAULT 0, payment_received_cents INTEGER NOT NULL DEFAULT 0")}
${simpleTable("whatsapp_templates", "name TEXT NOT NULL, body TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0")}
${simpleTable("reminders", "customer_id TEXT NOT NULL REFERENCES customers(id), template_id TEXT REFERENCES whatsapp_templates(id), scheduled_at TEXT, sent_at TEXT, status TEXT NOT NULL DEFAULT 'prepared'")}
${simpleTable("reminder_logs", "reminder_id TEXT NOT NULL REFERENCES reminders(id), customer_id TEXT NOT NULL REFERENCES customers(id), status TEXT NOT NULL, message_body TEXT NOT NULL")}
CREATE TABLE audit_logs (id TEXT PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, metadata_json TEXT, created_at TEXT NOT NULL);
${simpleTable("system_logs", "level TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL, metadata_json TEXT")}
${simpleTable("print_jobs", "job_type TEXT NOT NULL, printer_name TEXT, status TEXT NOT NULL, payload_json TEXT, error_message TEXT")}
${simpleTable("backup_history", "path TEXT NOT NULL, size_bytes INTEGER NOT NULL, checksum TEXT NOT NULL, status TEXT NOT NULL, backup_type TEXT NOT NULL, verified_at TEXT")}
${simpleTable("sync_queue", "aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'")}
${simpleTable("app_settings", "setting_key TEXT NOT NULL UNIQUE, setting_value TEXT NOT NULL, value_type TEXT NOT NULL DEFAULT 'string'")}
${simpleTable("devices", "device_name TEXT NOT NULL, remembered INTEGER NOT NULL DEFAULT 0")}
${simpleTable("cash_registers", "name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active'")}
CREATE INDEX idx_customers_name ON customers(normalized_name);
CREATE INDEX idx_customers_phone ON customers(normalized_phone);
CREATE INDEX idx_customers_is_deleted ON customers(is_deleted);
CREATE INDEX idx_ledger_customer_id ON ledger_entries(customer_id);
CREATE INDEX idx_ledger_created_at ON ledger_entries(created_at);
CREATE INDEX idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_audit_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX idx_backup_created_at ON backup_history(created_at);
${roleSeeds}
${permissionSeeds}
${rolePermissionSeeds}
INSERT INTO app_settings (id, setting_key, setting_value, value_type, created_at, updated_at)
VALUES
  ('setting_currency', 'currency', 'TRY', 'string', datetime('now'), datetime('now')),
  ('setting_date_format', 'dateFormat', 'dd.MM.yyyy', 'string', datetime('now'), datetime('now')),
  ('setting_session_timeout', 'sessionTimeoutMinutes', '30', 'number', datetime('now'), datetime('now')),
  ('setting_backup_hour', 'autoBackupHour', '21:00', 'string', datetime('now'), datetime('now'));
INSERT INTO whatsapp_templates (id, name, body, is_default, created_at, updated_at)
VALUES ('template_default_debt_reminder', 'Varsayılan Borç Hatırlatma', 'Merhaba {customerName}, BakiyeDefter kayıtlarına göre mevcut bakiyeniz {balance} TL görünmektedir. Uygun olduğunuzda uğrayabilirsiniz. İyi günler.', 1, datetime('now'), datetime('now'));
`
};
const customerFinanceProfile = {
  version: 2,
  name: "customer_finance_profile",
  sql: `
ALTER TABLE customers ADD COLUMN credit_limit_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN payment_terms_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE customers ADD COLUMN last_contacted_at TEXT;
CREATE INDEX idx_customers_credit_limit ON customers(credit_limit_cents);
CREATE INDEX idx_customers_payment_terms ON customers(payment_terms_days);
`
};
const customerCodeAndPosIntegration = {
  version: 3,
  name: "customer_code_and_pos_integration",
  sql: `
ALTER TABLE customers ADD COLUMN customer_code TEXT;
UPDATE customers
SET customer_code =
  'CR' || strftime('%d%m', created_at) || '-MG' ||
  substr('00' || rowid, -2, 2) ||
  'K' || substr('00' || ((rowid * 17 + length(display_name)) % 100), -2, 2)
WHERE customer_code IS NULL;
CREATE UNIQUE INDEX idx_customers_customer_code ON customers(customer_code);
CREATE INDEX idx_customers_customer_code_search ON customers(customer_code, is_deleted);

CREATE TABLE pos_terminals (
  id TEXT PRIMARY KEY,
  terminal_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK(connection_type IN ('manual', 'tcp', 'serial', 'usb')),
  endpoint TEXT,
  port INTEGER,
  pairing_key TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  last_connected_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pos_connection_events (
  id TEXT PRIMARY KEY,
  terminal_id TEXT REFERENCES pos_terminals(id),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_pos_terminals_status ON pos_terminals(status, is_deleted);
CREATE INDEX idx_pos_events_terminal_id ON pos_connection_events(terminal_id, created_at);

INSERT INTO app_settings (id, setting_key, setting_value, value_type, created_at, updated_at)
VALUES
  ('setting_posIntegrationEnabled', 'posIntegrationEnabled', 'false', 'boolean', datetime('now'), datetime('now')),
  ('setting_posProvider', 'posProvider', 'local-terminal', 'string', datetime('now'), datetime('now')),
  ('setting_posConnectionMode', 'posConnectionMode', 'manual', 'string', datetime('now'), datetime('now')),
  ('setting_posTimeoutSeconds', 'posTimeoutSeconds', '10', 'number', datetime('now'), datetime('now'));
`
};
const migrations = [initialSchema, customerFinanceProfile, customerCodeAndPosIntegration];
function runMigrations(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const current = db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get();
  const pending = migrations.filter((migration) => migration.version > current.version);
  const apply = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(migration.version, migration.name, (/* @__PURE__ */ new Date()).toISOString());
    }
  });
  try {
    apply();
  } catch (error) {
    throw new DatabaseError("Database migration failed", { message: error instanceof Error ? error.message : String(error) });
  }
}
function createAppDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const handle = new Database(databasePath);
  configureSqlite(handle);
  runMigrations(handle);
  return toAppDatabase(databasePath, handle);
}
function toAppDatabase(databasePath, handle) {
  return {
    path: databasePath,
    handle,
    close: () => handle.close(),
    integrityCheck: () => handle.prepare("PRAGMA integrity_check").get().integrity_check
  };
}
function configureSqlite(handle) {
  try {
    handle.pragma("journal_mode = WAL");
    handle.pragma("foreign_keys = ON");
    handle.pragma("busy_timeout = 5000");
    handle.pragma("synchronous = NORMAL");
    handle.pragma("temp_store = MEMORY");
  } catch (error) {
    throw new DatabaseError("SQLite configuration failed", { message: error instanceof Error ? error.message : String(error) });
  }
}
function ok(data) {
  return { ok: true, data };
}
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
function buildDashboardPrintHtml(document) {
  const metrics = document.dashboard;
  const movements = document.recentTransactions.map(
    (entry) => `
        <tr>
          <td>${escapeHtml(formatDate(entry.occurredAt))}</td>
          <td>${escapeHtml(labelFor(entry.eventType))}</td>
          <td>${escapeHtml(entry.customerName)}</td>
          <td>${escapeHtml(entry.description ?? "-")}</td>
          <td class="${entry.direction === "credit" ? "credit" : "debit"}">${formatMoney(entry.amountCents)}</td>
        </tr>`
  ).join("");
  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(document.documentTitle)}</title>
    <style>
      @page { margin: 14mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111827; font: 12px "Segoe UI", Arial, sans-serif; }
      header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #172033; padding-bottom: 12px; margin-bottom: 18px; }
      h1 { margin: 0 0 4px; font-size: 22px; }
      h2 { margin: 20px 0 8px; font-size: 15px; }
      .muted { color: #667085; }
      .demo { display: inline-block; border: 1px solid #c96f18; border-radius: 999px; color: #9a4f0f; background: #fff1df; padding: 4px 9px; font-weight: 800; }
      .meta { text-align: right; line-height: 1.6; }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
      .stat { border: 1px solid #dfe6ee; border-radius: 8px; padding: 10px; }
      .stat span { display: block; color: #667085; font-size: 11px; font-weight: 700; }
      .stat strong { display: block; margin-top: 4px; font-size: 17px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #dfe6ee; padding: 8px 6px; text-align: left; vertical-align: top; }
      th { background: #f5f7fb; color: #475467; font-size: 10px; text-transform: uppercase; }
      .credit { color: #16804f; font-weight: 800; }
      .debit { color: #c96f18; font-weight: 800; }
      footer { margin-top: 20px; border-top: 1px solid #dfe6ee; padding-top: 10px; color: #667085; font-size: 11px; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>BakiyeDefter POS</h1>
        <div class="muted">Güncel işletme özeti</div>
        <p class="demo">${escapeHtml(document.demoNotice)}</p>
      </div>
      <div class="meta">
        <div><strong>Versiyon:</strong> v1.6.3 Demo</div>
        <div><strong>Hazırlayan:</strong> ${escapeHtml(document.printedBy)}</div>
        <div><strong>Tarih:</strong> ${escapeHtml(formatDate(document.generatedAt))}</div>
        <div><strong>Yazıcı:</strong> ${escapeHtml(document.printerName ?? "Sistem seçimi")}</div>
      </div>
    </header>

    <section class="stats">
      <div class="stat"><span>Toplam Cari</span><strong>${metrics.totalCustomers}</strong></div>
      <div class="stat"><span>Toplam Borç</span><strong>${formatMoney(metrics.totalReceivableCents)}</strong></div>
      <div class="stat"><span>Bugün Tahsilat</span><strong>${formatMoney(metrics.todayPaymentCents)}</strong></div>
      <div class="stat"><span>Bugün Borç Ekleme</span><strong>${formatMoney(metrics.todayDebtCents)}</strong></div>
      <div class="stat"><span>Kasa Bakiyesi</span><strong>${formatMoney(metrics.cashBalanceCents)}</strong></div>
      <div class="stat"><span>Borçlu Cari</span><strong>${metrics.debtorCustomers}</strong></div>
    </section>

    <h2>Son Hesap Hareketleri</h2>
    <table>
      <thead>
        <tr><th>Saat</th><th>İşlem</th><th>Cari</th><th>Açıklama</th><th>Tutar</th></tr>
      </thead>
      <tbody>
        ${movements || `<tr><td colspan="5" class="muted">Henüz hesap hareketi yok.</td></tr>`}
      </tbody>
    </table>

    <footer>
      Bu çıktı BakiyeDefter POS demo sürümünden alınmıştır ve resmi mali belge niteliği taşımaz.
    </footer>
  </body>
</html>`;
}
function formatMoney(amountCents) {
  return money.format(amountCents / 100);
}
function formatDate(value) {
  return dateTime.format(new Date(value));
}
function labelFor(eventType) {
  return { DebtAdded: "Borç Ekle", PaymentReceived: "Tahsilat", TransactionVoided: "İptal", AdjustmentCreated: "Düzeltme", OpeningBalanceCreated: "Açılış" }[eventType] ?? eventType;
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function registerIpcRouter(services) {
  const register = (channel, schema, handler) => {
    electron.ipcMain.handle(channel, async (_event, payload) => {
      try {
        return ok(await handler(schema.parse(payload ?? {})));
      } catch (error) {
        return normalizeUnknownError(error);
      }
    });
  };
  register("auth:get-state", zod.z.object({}), () => services.auth.getState());
  register("auth:create-first-owner", zod.z.object({ username: zod.z.string().min(3), displayName: zod.z.string().min(2), password: zod.z.string().min(8) }), (input) => services.auth.createFirstOwner(input));
  const loginSchema = zod.z.object({
    username: zod.z.string().min(1),
    password: zod.z.string().min(1),
    roleHint: zod.z.enum(["owner", "cashier"]).optional(),
    rememberDevice: zod.z.boolean().optional()
  });
  register("auth:login", loginSchema, (input) => services.auth.login({ ...input, deviceName: os.hostname() }));
  register("auth:logout", zod.z.object({}), () => {
    services.auth.logout();
    return { loggedOut: true };
  });
  register("auth:get-current-user", zod.z.object({}), () => services.auth.getState().currentUser);
  register("auth:lock", zod.z.object({}), () => {
    services.auth.logout();
    return { locked: true };
  });
  register("auth:unlock", zod.z.object({ username: zod.z.string(), password: zod.z.string() }), (input) => services.auth.login(input));
  const risk = zod.z.enum(["standard", "trusted", "watch", "blocked"]);
  register("customers:create", zod.z.object({ displayName: zod.z.string().min(2), phone: zod.z.string().optional().nullable(), note: zod.z.string().optional().nullable(), riskStatus: risk.optional(), creditLimitCents: zod.z.number().int().nonnegative().optional(), paymentTermsDays: zod.z.number().int().min(0).max(365).optional() }), (input) => services.customers.create(input));
  register("customers:update", zod.z.object({ customerId: zod.z.string(), displayName: zod.z.string().min(2), phone: zod.z.string().optional().nullable(), note: zod.z.string().optional().nullable(), riskStatus: risk.optional(), creditLimitCents: zod.z.number().int().nonnegative().optional(), paymentTermsDays: zod.z.number().int().min(0).max(365).optional() }), (input) => services.customers.update(input));
  register("customers:archive", zod.z.object({ customerId: zod.z.string() }), (input) => services.customers.archive(input.customerId));
  register("customers:search", zod.z.object({ query: zod.z.string().optional(), onlyDebtors: zod.z.boolean().optional(), sortBy: zod.z.enum(["name", "balance", "lastLedgerAt"]).optional(), limit: zod.z.number().int().positive().max(200).optional() }), (input) => services.customers.search(input));
  register("customers:get-by-id", zod.z.object({ customerId: zod.z.string() }), (input) => services.customers.getById(input.customerId));
  register("customers:get-ledger", zod.z.object({ customerId: zod.z.string() }), (input) => services.customers.getLedger(input.customerId));
  register("transactions:add-debt", zod.z.object({ customerId: zod.z.string(), amountCents: zod.z.number().int().positive(), description: zod.z.string().optional().nullable(), dueAt: zod.z.string().optional().nullable(), idempotencyKey: zod.z.string().optional() }), (input) => services.transactions.addDebt(input));
  register("transactions:receive-payment", zod.z.object({ customerId: zod.z.string(), amountCents: zod.z.number().int().positive(), description: zod.z.string().optional().nullable(), paymentMethod: zod.z.enum(["cash", "card", "transfer"]).optional(), idempotencyKey: zod.z.string().optional() }), (input) => services.transactions.receivePayment(input));
  register("transactions:void", zod.z.object({ ledgerEntryId: zod.z.string(), reason: zod.z.string().min(3) }), (input) => services.transactions.void(input));
  register("transactions:undo-last", zod.z.object({}), () => services.transactions.undoLast());
  register("transactions:get-history", zod.z.object({ limit: zod.z.number().int().positive().max(200).optional() }), (input) => services.transactions.getHistory(input.limit));
  register("reports:get-dashboard", zod.z.object({}), () => services.dashboard.getDashboard());
  register("quick-actions:get-summary", zod.z.object({}), () => ({ dashboard: services.dashboard.getDashboard(), recentTransactions: services.transactions.getHistory(10), openDebtors: services.customers.search({ onlyDebtors: true, sortBy: "balance", limit: 10 }) }));
  register("backup:create", zod.z.object({ targetDir: zod.z.string().optional() }), (input) => services.backup.createManualBackup(input.targetDir));
  register("backup:list", zod.z.object({}), () => services.backup.list());
  const posConnectionType = zod.z.enum(["manual", "tcp", "serial", "usb"]);
  register("pos:get-status", zod.z.object({}), () => services.pos.getStatus());
  register("pos:list-terminals", zod.z.object({}), () => services.pos.listTerminals());
  register(
    "pos:save-terminal",
    zod.z.object({
      id: zod.z.string().optional(),
      terminalCode: zod.z.string().optional(),
      displayName: zod.z.string().min(2),
      provider: zod.z.string().min(2),
      connectionType: posConnectionType,
      endpoint: zod.z.string().optional().nullable(),
      port: zod.z.number().int().positive().max(65535).optional().nullable(),
      pairingKey: zod.z.string().optional().nullable()
    }),
    (input) => services.pos.saveTerminal(input)
  );
  register("pos:test-connection", zod.z.object({ terminalId: zod.z.string() }), (input) => services.pos.testConnection(input.terminalId));
  register("settings:get", zod.z.object({}), () => services.settings.getAll());
  register("settings:update", zod.z.record(zod.z.string(), zod.z.union([zod.z.string(), zod.z.number(), zod.z.boolean()])), (input) => services.settings.update(input));
  register("system:get-login-status", zod.z.object({}), () => services.systemHealth.getLoginStatus());
  register("system:get-health", zod.z.object({}), () => services.systemHealth.getHealth());
  register("system:run-integrity-check", zod.z.object({}), () => services.systemHealth.runIntegrityCheck());
  electron.ipcMain.handle("printer:list", async (event) => {
    try {
      const printers = await event.sender.getPrintersAsync();
      return ok(printers.map((printer) => ({ name: printer.name, displayName: printer.displayName, description: printer.description ?? "", isDefault: false, status: "" })));
    } catch (error) {
      return normalizeUnknownError(new PrinterError("Printer list failed", { message: error instanceof Error ? error.message : String(error) }));
    }
  });
  electron.ipcMain.handle("printer:print-dashboard", async (event, payload) => {
    const schema = zod.z.object({ printerName: zod.z.string().optional().nullable(), silent: zod.z.boolean().optional() });
    let prepared = null;
    try {
      const input = schema.parse(payload ?? {});
      prepared = services.printer.prepareDashboardPrint({ printerName: input.printerName ?? null });
      const result = await printHtml({
        owner: electron.BrowserWindow.fromWebContents(event.sender),
        html: buildDashboardPrintHtml(prepared),
        printerName: input.printerName ?? null,
        silent: input.silent ?? false
      });
      services.printer.completePrintJob({ printJobId: prepared.jobId, status: result.status, actorUserId: prepared.actorUserId, printerName: input.printerName ?? null });
      return ok({ jobId: prepared.jobId, status: result.status, printerName: input.printerName ?? null, printedAt: (/* @__PURE__ */ new Date()).toISOString(), documentTitle: prepared.documentTitle });
    } catch (error) {
      if (prepared) {
        services.printer.failPrintJob({ printJobId: prepared.jobId, actorUserId: prepared.actorUserId, reason: error instanceof Error ? error.message : String(error), printerName: prepared.printerName });
      }
      return normalizeUnknownError(error);
    }
  });
  electron.ipcMain.handle("window:minimize", (event) => {
    electron.BrowserWindow.fromWebContents(event.sender)?.minimize();
    return ok({ ok: true });
  });
  electron.ipcMain.handle("window:toggle-maximize", (event) => {
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (window?.isMaximized()) window.unmaximize();
    else window?.maximize();
    return ok({ ok: true });
  });
  electron.ipcMain.handle("window:close", (event) => {
    electron.BrowserWindow.fromWebContents(event.sender)?.close();
    return ok({ ok: true });
  });
}
async function printHtml(input) {
  const printWindow = new electron.BrowserWindow({
    parent: input.owner ?? void 0,
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(input.html)}`);
    return await new Promise((resolve, reject) => {
      printWindow.webContents.print({ silent: input.silent, printBackground: true, deviceName: input.printerName ?? void 0 }, (success, failureReason) => {
        if (success) {
          resolve({ status: "printed" });
          return;
        }
        if (failureReason && /cancel/i.test(failureReason)) {
          resolve({ status: "cancelled" });
          return;
        }
        reject(new PrinterError("Print failed", { reason: failureReason || "unknown" }));
      });
    });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }
}
function bootstrapApp() {
  const userDataPath = electron.app.getPath("userData");
  const runtimePaths = resolveRuntimePaths(userDataPath);
  const database = createAppDatabase(runtimePaths.databasePath);
  registerIpcRouter(createApplicationServices({ database, userDataPath: runtimePaths.dataRootPath, appVersion: electron.app.getVersion() }));
  return { database };
}
function resolveRuntimePaths(userDataPath) {
  const explicitDatabasePath = process.env.BAKIYEDEFTER_DB_PATH?.trim();
  if (explicitDatabasePath) {
    const databasePath = path.resolve(explicitDatabasePath);
    return { databasePath, dataRootPath: path.dirname(databasePath) };
  }
  const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR?.trim() || process.env.BAKIYEDEFTER_PORTABLE_DATA_DIR?.trim();
  if (portableRoot) {
    const dataRootPath = path.join(path.resolve(portableRoot), "BakiyeDefter POS Data");
    return { databasePath: path.join(dataRootPath, "bakiyedefter.db"), dataRootPath };
  }
  const sidecarDataRoot = path.join(path.dirname(process.execPath), "BakiyeDefter POS Data");
  if (fs.existsSync(sidecarDataRoot)) {
    return { databasePath: path.join(sidecarDataRoot, "bakiyedefter.db"), dataRootPath: sidecarDataRoot };
  }
  return { databasePath: path.join(userDataPath, "bakiyedefter.db"), dataRootPath: userDataPath };
}
function createMainWindow() {
  const workArea = electron.screen.getPrimaryDisplay().workArea;
  const window = new electron.BrowserWindow({
    width: Math.min(1180, workArea.width - 24),
    height: Math.min(720, workArea.height - 24),
    center: true,
    minWidth: 980,
    minHeight: 680,
    title: "BakiyeDefter POS",
    icon: resolveWindowIconPath(),
    frame: false,
    backgroundColor: "#f6f8fb",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  window.once("ready-to-show", () => {
    window.center();
    window.show();
  });
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL).catch(console.error);
  else window.loadFile(path.join(__dirname, "../renderer/index.html")).catch(console.error);
  return window;
}
function resolveWindowIconPath() {
  const packagedIconPath = path.join(process.resourcesPath, "icon.ico");
  if (electron.app.isPackaged && fs.existsSync(packagedIconPath)) return packagedIconPath;
  const developmentIconPath = path.resolve(process.cwd(), "build", "icon.ico");
  return fs.existsSync(developmentIconPath) ? developmentIconPath : void 0;
}
function applyAppSecurityDefaults() {
  electron.app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://") || url.startsWith("mailto:")) electron.shell.openExternal(url).catch(() => void 0);
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => {
      if (contents.getURL() && url !== contents.getURL()) event.preventDefault();
    });
    contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  });
  electron.app.on("browser-window-created", (_event, window) => {
    window.webContents.on("before-input-event", (event, input) => {
      if (input.control && input.shift && input.key.toLocaleLowerCase("tr-TR") === "i" && electron.app.isPackaged) event.preventDefault();
    });
  });
}
let closeDatabase = null;
applyAppSecurityDefaults();
electron.app.setName("BakiyeDefter POS");
electron.app.setAppUserModelId("com.bakiyedefter.pos");
electron.app.whenReady().then(() => {
  const bootstrapped = bootstrapApp();
  closeDatabase = bootstrapped.database.close;
  createMainWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", () => {
  closeDatabase?.();
});
