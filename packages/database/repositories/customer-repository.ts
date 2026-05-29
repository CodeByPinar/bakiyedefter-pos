import type Database from "better-sqlite3";
import { buildCustomerCode, customerCodeDatePrefix } from "@domain/customers/customer-code";
import type { Customer, CustomerListItem, CustomerRiskStatus } from "@domain/customers/customer-types";
import type { LedgerEntry } from "@domain/ledger/ledger-types";
import { createId } from "@domain/shared/ids";
import { normalizeForSearch, normalizePhone } from "@domain/shared/normalize";
import { AppError, ValidationError } from "@shared/errors";

type CustomerRow = {
  id: string;
  customer_code: string;
  display_name: string;
  phone: string | null;
  normalized_phone: string | null;
  note: string | null;
  risk_status: CustomerRiskStatus;
  credit_limit_cents: number;
  payment_terms_days: number;
  last_contacted_at: string | null;
  current_balance_cents: number;
  last_ledger_at: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerSearchRow = CustomerRow & {
  last_payment_at: string | null;
  debt_entry_count: number;
  payment_entry_count: number;
  overdue_debt_cents: number;
};

type LedgerRow = {
  id: string;
  customer_id: string;
  event_type: LedgerEntry["eventType"];
  direction: LedgerEntry["direction"];
  amount_cents: number;
  description: string | null;
  occurred_at: string;
  created_at: string;
  created_by: string | null;
  source_transaction_id: string;
  voids_ledger_entry_id: string | null;
};

export type CustomerSearchParams = { query?: string; onlyDebtors?: boolean; sortBy?: "name" | "balance" | "lastLedgerAt"; limit?: number };

export class CustomerRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: { displayName: string; phone?: string | null; note?: string | null; riskStatus?: CustomerRiskStatus; creditLimitCents?: number; paymentTermsDays?: number; actorUserId: string }): Customer {
    const displayName = input.displayName.trim();
    if (displayName.length < 2) throw new ValidationError("Customer display name is too short");
    const creditLimitCents = normalizeCreditLimit(input.creditLimitCents);
    const paymentTermsDays = normalizePaymentTerms(input.paymentTermsDays);
    const createdAt = new Date();
    const now = createdAt.toISOString();
    const id = createId("cus");
    const customerCode = this.nextCustomerCode(displayName, createdAt);
    this.db
      .prepare("INSERT INTO customers (id, customer_code, display_name, normalized_name, phone, normalized_phone, note, risk_status, credit_limit_cents, payment_terms_days, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, customerCode, displayName, normalizeForSearch(displayName), input.phone?.trim() || null, normalizePhone(input.phone), input.note?.trim() || null, input.riskStatus ?? "standard", creditLimitCents, paymentTermsDays, now, now, input.actorUserId, input.actorUserId);
    return this.getById(id)!;
  }

  update(input: { customerId: string; displayName: string; phone?: string | null; note?: string | null; riskStatus?: CustomerRiskStatus; creditLimitCents?: number; paymentTermsDays?: number; actorUserId: string }): Customer {
    const existing = this.getById(input.customerId);
    if (!existing) throw new AppError("NOT_FOUND", "Customer not found", "Cari bulunamadı.");
    const displayName = input.displayName.trim();
    if (displayName.length < 2) throw new ValidationError("Customer display name is too short");
    const creditLimitCents = input.creditLimitCents === undefined ? existing.creditLimitCents : normalizeCreditLimit(input.creditLimitCents);
    const paymentTermsDays = input.paymentTermsDays === undefined ? existing.paymentTermsDays : normalizePaymentTerms(input.paymentTermsDays);
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE customers SET display_name = ?, normalized_name = ?, phone = ?, normalized_phone = ?, note = ?, risk_status = ?, credit_limit_cents = ?, payment_terms_days = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ? AND is_deleted = 0")
      .run(displayName, normalizeForSearch(displayName), input.phone?.trim() || null, normalizePhone(input.phone), input.note?.trim() || null, input.riskStatus ?? existing.riskStatus, creditLimitCents, paymentTermsDays, now, input.actorUserId, input.customerId);
    return this.getById(input.customerId)!;
  }

  archive(customerId: string, actorUserId: string): void {
    const existing = this.getById(customerId);
    if (!existing) throw new AppError("NOT_FOUND", "Customer not found", "Cari bulunamadı.");
    if (existing.currentBalanceCents !== 0) throw new ValidationError("Customers with non-zero balance cannot be archived", { customerId });
    const now = new Date().toISOString();
    this.db.prepare("UPDATE customers SET is_deleted = 1, deleted_at = ?, archived_at = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?").run(now, now, now, actorUserId, customerId);
  }

  getById(customerId: string): Customer | null {
    const row = this.db.prepare(baseCustomerSelect("WHERE id = ? AND is_deleted = 0")).get(customerId) as CustomerRow | undefined;
    return row ? mapCustomer(row) : null;
  }

  search(params: CustomerSearchParams): CustomerListItem[] {
    const clauses = ["c.is_deleted = 0"];
    const values: unknown[] = [];
    const query = normalizeForSearch(params.query ?? "");
    if (query) {
      clauses.push("(c.normalized_name LIKE ? OR c.normalized_phone LIKE ? OR c.customer_code LIKE ? OR REPLACE(c.customer_code, '-', '') LIKE ?)");
      values.push(`%${query}%`, `%${query.replace(/\s/g, "")}%`, `%${query.replace(/\s/g, "").toUpperCase()}%`, `%${query.replace(/\s/g, "").toUpperCase()}%`);
    }
    if (params.onlyDebtors) clauses.push("c.current_balance_cents > 0");
    const orderBy = orderBySql(params.sortBy);
    const rows = this.db
      .prepare(
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
      )
      .all(...values, Math.min(params.limit ?? 50, 200)) as CustomerSearchRow[];
    return rows.map(mapCustomerListItem);
  }

  getLedger(customerId: string, limit = 100): LedgerEntry[] {
    const rows = this.db.prepare("SELECT id, customer_id, event_type, direction, amount_cents, description, occurred_at, created_at, created_by, source_transaction_id, voids_ledger_entry_id FROM ledger_entries WHERE customer_id = ? AND is_deleted = 0 ORDER BY occurred_at DESC, rowid DESC LIMIT ?").all(customerId, Math.min(limit, 500)) as LedgerRow[];
    return rows.map(mapLedger);
  }

  private nextCustomerCode(displayName: string, createdAt: Date): string {
    const prefix = customerCodeDatePrefix(createdAt);
    const sequenceRow = this.db.prepare("SELECT COUNT(*) AS count FROM customers WHERE customer_code LIKE ?").get(`${prefix}%`) as { count: number };
    let sequence = sequenceRow.count + 1;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = buildCustomerCode({ displayName, createdAt, sequence: sequence + attempt });
      const existing = this.db.prepare("SELECT 1 FROM customers WHERE customer_code = ? LIMIT 1").get(candidate);
      if (!existing) return candidate;
    }

    throw new AppError("CONFLICT", "Could not allocate customer code", "Cari kodu üretilemedi. Lütfen tekrar deneyin.");
  }
}

function baseCustomerSelect(where: string): string {
  return `SELECT id, customer_code, display_name, phone, normalized_phone, note, risk_status, credit_limit_cents, payment_terms_days, last_contacted_at, current_balance_cents, last_ledger_at, created_at, updated_at FROM customers ${where}`;
}

function orderBySql(sortBy: CustomerSearchParams["sortBy"]): string {
  if (sortBy === "balance") return "c.current_balance_cents DESC, c.display_name ASC";
  if (sortBy === "lastLedgerAt") return "c.last_ledger_at DESC NULLS LAST, c.display_name ASC";
  return "c.normalized_name ASC";
}

function mapCustomer(row: CustomerRow): Customer {
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

function mapCustomerListItem(row: CustomerSearchRow): CustomerListItem {
  const customer = mapCustomer(row);
  return {
    ...customer,
    lastPaymentAt: row.last_payment_at,
    debtEntryCount: row.debt_entry_count ?? 0,
    paymentEntryCount: row.payment_entry_count ?? 0,
    overdueDebtCents: row.overdue_debt_cents ?? 0,
    creditUsagePercent: customer.creditLimitCents > 0 ? Math.round((customer.currentBalanceCents / customer.creditLimitCents) * 100) : null
  };
}

function mapLedger(row: LedgerRow): LedgerEntry {
  return { id: row.id, customerId: row.customer_id, eventType: row.event_type, direction: row.direction, amountCents: row.amount_cents, description: row.description, occurredAt: row.occurred_at, createdAt: row.created_at, createdBy: row.created_by, sourceTransactionId: row.source_transaction_id, voidsLedgerEntryId: row.voids_ledger_entry_id };
}

function normalizeCreditLimit(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) throw new ValidationError("Credit limit must be a non-negative integer");
  return value;
}

function normalizePaymentTerms(value: number | undefined): number {
  if (value === undefined) return 30;
  if (!Number.isInteger(value) || value < 0 || value > 365) throw new ValidationError("Payment terms must be between 0 and 365 days");
  return value;
}
