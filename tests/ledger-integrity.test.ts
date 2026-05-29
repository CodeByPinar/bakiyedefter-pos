import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApplicationServices, type ApplicationServices } from "@application/container";
import { createMemoryDatabase, type AppDatabase } from "@database/connection";

let database: AppDatabase;
let services: ApplicationServices;
let tempDir: string;

beforeEach(async () => {
  database = createMemoryDatabase();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bakiyedefter-"));
  services = createApplicationServices({ database, userDataPath: tempDir, appVersion: "test" });
  await services.auth.createFirstOwner({ username: "owner", displayName: "Owner User", password: "strong-pass" });
});

afterEach(() => {
  database.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("ledger write model", () => {
  it("adds debt, receives partial payment and computes dashboard from ledger entries", () => {
    const customer = services.customers.create({ displayName: "Ahmet Yilmaz", phone: "0555 111 22 33" });
    expect(customer.customerCode).toMatch(/^CR\d{4}-[A-Z0-9]{4}K[A-Z0-9]{2}$/);

    services.transactions.addDebt({ customerId: customer.id, amountCents: 12_500, description: "Market alisverisi" });
    services.transactions.receivePayment({ customerId: customer.id, amountCents: 4_000, description: "Kismi odeme" });

    expect(services.customers.getById(customer.id)?.currentBalanceCents).toBe(8_500);
    const dashboard = services.dashboard.getDashboard();
    expect(dashboard.totalReceivableCents).toBe(8_500);
    expect(dashboard.todayDebtCents).toBe(12_500);
    expect(dashboard.todayPaymentCents).toBe(4_000);
  });

  it("voids the latest ledger entry instead of mutating history", () => {
    const customer = services.customers.create({ displayName: "Mehmet Kaya" });
    const debt = services.transactions.addDebt({ customerId: customer.id, amountCents: 7_500 });
    const voidEntry = services.transactions.undoLast();
    const ledger = services.customers.getLedger(customer.id);

    expect(voidEntry.eventType).toBe("TransactionVoided");
    expect(voidEntry.voidsLedgerEntryId).toBe(debt.id);
    expect(ledger).toHaveLength(2);
    expect(services.customers.getById(customer.id)?.currentBalanceCents).toBe(0);
  });

  it("rejects payments above the current balance", () => {
    const customer = services.customers.create({ displayName: "Ayse Demir" });
    services.transactions.addDebt({ customerId: customer.id, amountCents: 2_000 });
    expect(() => services.transactions.receivePayment({ customerId: customer.id, amountCents: 3_000 })).toThrow();
  });
});

describe("backup", () => {
  it("creates a verified SQLite backup file", async () => {
    services.customers.create({ displayName: "Backup Cari" });
    const backup = await services.backup.createManualBackup(path.join(tempDir, "manual-backups"));

    expect(backup.status).toBe("verified");
    expect(fs.existsSync(backup.path)).toBe(true);
    expect(backup.checksum).toHaveLength(64);
  });
});

describe("printer", () => {
  it("prepares dashboard print jobs from real ledger data", () => {
    const customer = services.customers.create({ displayName: "Print Cari" });
    services.transactions.addDebt({ customerId: customer.id, amountCents: 9_000 });

    const document = services.printer.prepareDashboardPrint({});
    const printJob = database.handle.prepare("SELECT status, job_type FROM print_jobs WHERE id = ?").get(document.jobId) as { status: string; job_type: string };

    expect(document.dashboard.totalReceivableCents).toBe(9_000);
    expect(document.recentTransactions).toHaveLength(1);
    expect(printJob).toEqual({ status: "queued", job_type: "dashboard-summary" });
  });
});

describe("pos integration", () => {
  it("saves a POS terminal and records a manual connection check", async () => {
    const terminal = services.pos.saveTerminal({
      displayName: "Merkez POS",
      provider: "local-terminal",
      connectionType: "manual"
    });
    const result = await services.pos.testConnection(terminal.id);
    const status = services.pos.getStatus();

    expect(terminal.terminalCode).toMatch(/^POS\d{4}-\d{2}$/);
    expect(result.status).toBe("manual");
    expect(status.terminalCount).toBe(1);
    expect(status.latestEvent?.status).toBe("manual");
  });
});
