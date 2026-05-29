import path from "node:path";
import type { AppDatabase } from "@database/connection";
import { AuditLogRepository } from "@database/repositories/audit-log-repository";
import { BackupHistoryRepository } from "@database/repositories/backup-history-repository";
import { CustomerRepository } from "@database/repositories/customer-repository";
import { DeviceRepository } from "@database/repositories/device-repository";
import { LedgerRepository } from "@database/repositories/ledger-repository";
import { PosTerminalRepository } from "@database/repositories/pos-terminal-repository";
import { PrintJobRepository } from "@database/repositories/print-job-repository";
import { SettingsRepository } from "@database/repositories/settings-repository";
import { UserRepository } from "@database/repositories/user-repository";
import { AuthService } from "./auth/auth-service";
import { BackupService } from "./backup/backup-service";
import { CustomerService } from "./customers/customer-service";
import { PosService } from "./pos/pos-service";
import { PrinterService } from "./printer/printer-service";
import { DashboardQuery } from "./reports/dashboard-query";
import { SettingsService } from "./settings/settings-service";
import { SystemHealthService } from "./system/system-health-service";
import { TransactionService } from "./transactions/transaction-service";

export type ApplicationServices = {
  auth: AuthService;
  customers: CustomerService;
  transactions: TransactionService;
  dashboard: DashboardQuery;
  backup: BackupService;
  pos: PosService;
  printer: PrinterService;
  settings: SettingsService;
  systemHealth: SystemHealthService;
};

export function createApplicationServices(input: { database: AppDatabase; userDataPath: string; appVersion: string }): ApplicationServices {
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
