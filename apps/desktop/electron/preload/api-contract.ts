import type { IpcResult } from "@shared/result";

export type AuthenticatedUserDto = { id: string; username: string; displayName: string; role: string; permissions: string[] };
export type AuthStateDto = { setupRequired: true; currentUser: null } | { setupRequired: false; currentUser: AuthenticatedUserDto | null };
export type CustomerDto = { id: string; customerCode: string; displayName: string; phone: string | null; normalizedPhone: string | null; note: string | null; riskStatus: "standard" | "trusted" | "watch" | "blocked"; creditLimitCents: number; paymentTermsDays: number; lastContactedAt: string | null; currentBalanceCents: number; lastLedgerAt: string | null; createdAt: string; updatedAt: string };
export type CustomerListItemDto = CustomerDto & { lastPaymentAt: string | null; debtEntryCount: number; paymentEntryCount: number; overdueDebtCents: number; creditUsagePercent: number | null };
export type LedgerEntryDto = { id: string; customerId: string; eventType: string; direction: "debit" | "credit" | "neutral"; amountCents: number; description: string | null; occurredAt: string; createdAt: string; createdBy: string | null; sourceTransactionId: string; voidsLedgerEntryId: string | null };
export type LedgerHistoryItemDto = LedgerEntryDto & { customerName: string; actorName: string | null };
export type DashboardDto = { totalReceivableCents: number; todayDebtCents: number; todayDebtCount: number; todayPaymentCents: number; todayPaymentCount: number; netChangeCents: number; totalCustomers: number; activeCustomers: number; archivedCustomers: number; debtorCustomers: number; noPaymentThirtyDays: number; riskyCustomers: number; cashBalanceCents: number; debtAging: { currentThirtyCents: number; thirtyOneSixtyCents: number; sixtyOneNinetyCents: number; overNinetyCents: number }; topDebtors: Array<{ customerId: string; displayName: string; balanceCents: number }>; cashierActivity: Array<{ userId: string | null; displayName: string; transactionCount: number }>; hourlyIntensity: Array<{ hour: number; transactionCount: number }> };
export type BackupHistoryDto = { id: string; path: string; sizeBytes: number; checksum: string; status: string; backupType: string; verifiedAt: string | null; createdAt: string; createdBy: string | null };
export type SystemHealthDto = { databaseStatus: "ok" | "failed"; integrityCheck: string; databasePath: string; databaseSizeBytes: number; lastBackupAt: string | null; lastBackupStatus: string | null; backupFolderAccessible: boolean; diskAvailableBytes: number | null; pendingSyncCount: number; appVersion: string };
export type QuickActionsSummaryDto = { dashboard: DashboardDto; recentTransactions: LedgerHistoryItemDto[]; openDebtors: CustomerListItemDto[] };
export type PrinterDto = { name: string; displayName: string; description: string; isDefault: boolean; status: string };
export type PrintDashboardResultDto = { jobId: string; status: "printed" | "cancelled"; printerName: string | null; printedAt: string; documentTitle: string };
export type LoginStatusDto = { databaseReady: boolean; databaseStatus: "ok" | "failed"; backupReady: boolean; lastBackupAt: string | null; offlineSupported: boolean; appVersion: string };
export type PosConnectionTypeDto = "manual" | "tcp" | "serial" | "usb";
export type PosTerminalDto = { id: string; terminalCode: string; displayName: string; provider: string; connectionType: PosConnectionTypeDto; endpoint: string | null; port: number | null; pairingKey: string | null; status: "inactive" | "connected" | "failed" | "unsupported"; lastConnectedAt: string | null; lastError: string | null; createdAt: string; updatedAt: string };
export type PosConnectionEventDto = { id: string; terminalId: string | null; eventType: string; status: string; message: string | null; metadata: Record<string, unknown> | null; createdAt: string };
export type PosStatusDto = { enabled: boolean; provider: string; connectionMode: string; terminalCount: number; activeTerminal: PosTerminalDto | null; latestEvent: PosConnectionEventDto | null };
export type PosConnectionResultDto = { terminal: PosTerminalDto; connected: boolean; status: PosTerminalDto["status"] | "manual"; message: string; checkedAt: string };

export const ipcChannels = [
  "auth:get-state",
  "auth:create-first-owner",
  "auth:login",
  "auth:logout",
  "auth:get-current-user",
  "auth:lock",
  "auth:unlock",
  "customers:create",
  "customers:update",
  "customers:archive",
  "customers:search",
  "customers:get-by-id",
  "customers:get-ledger",
  "transactions:add-debt",
  "transactions:receive-payment",
  "transactions:void",
  "transactions:undo-last",
  "transactions:get-history",
  "quick-actions:get-summary",
  "reports:get-dashboard",
  "backup:create",
  "backup:list",
  "printer:list",
  "printer:print-dashboard",
  "pos:get-status",
  "pos:list-terminals",
  "pos:save-terminal",
  "pos:test-connection",
  "settings:get",
  "settings:update",
  "system:get-login-status",
  "system:get-health",
  "system:run-integrity-check",
  "window:minimize",
  "window:toggle-maximize",
  "window:close"
] as const;
export type IpcChannel = (typeof ipcChannels)[number];

export type BakiyeDefterApi = {
  auth: {
    getState(): Promise<IpcResult<AuthStateDto>>;
    createFirstOwner(input: { username: string; displayName: string; password: string }): Promise<IpcResult<AuthenticatedUserDto>>;
    login(input: { username: string; password: string; roleHint?: "owner" | "cashier"; rememberDevice?: boolean }): Promise<IpcResult<AuthenticatedUserDto>>;
    logout(): Promise<IpcResult<{ loggedOut: true }>>;
    getCurrentUser(): Promise<IpcResult<AuthenticatedUserDto | null>>;
  };
  customers: {
    create(input: { displayName: string; phone?: string | null; note?: string | null; riskStatus?: CustomerDto["riskStatus"]; creditLimitCents?: number; paymentTermsDays?: number }): Promise<IpcResult<CustomerDto>>;
    update(input: { customerId: string; displayName: string; phone?: string | null; note?: string | null; riskStatus?: CustomerDto["riskStatus"]; creditLimitCents?: number; paymentTermsDays?: number }): Promise<IpcResult<CustomerDto>>;
    archive(input: { customerId: string }): Promise<IpcResult<{ archived: true }>>;
    search(input: { query?: string; onlyDebtors?: boolean; sortBy?: "name" | "balance" | "lastLedgerAt"; limit?: number }): Promise<IpcResult<CustomerListItemDto[]>>;
    getById(input: { customerId: string }): Promise<IpcResult<CustomerDto | null>>;
    getLedger(input: { customerId: string }): Promise<IpcResult<LedgerEntryDto[]>>;
  };
  transactions: {
    addDebt(input: { customerId: string; amountCents: number; description?: string | null; dueAt?: string | null; idempotencyKey?: string }): Promise<IpcResult<LedgerEntryDto>>;
    receivePayment(input: { customerId: string; amountCents: number; description?: string | null; paymentMethod?: "cash" | "card" | "transfer"; idempotencyKey?: string }): Promise<IpcResult<LedgerEntryDto>>;
    void(input: { ledgerEntryId: string; reason: string }): Promise<IpcResult<LedgerEntryDto>>;
    undoLast(): Promise<IpcResult<LedgerEntryDto>>;
    getHistory(input?: { limit?: number }): Promise<IpcResult<LedgerHistoryItemDto[]>>;
  };
  quickActions: { getSummary(): Promise<IpcResult<QuickActionsSummaryDto>> };
  reports: { getDashboard(): Promise<IpcResult<DashboardDto>> };
  backup: { create(input?: { targetDir?: string }): Promise<IpcResult<BackupHistoryDto>>; list(): Promise<IpcResult<BackupHistoryDto[]>> };
  printer: { list(): Promise<IpcResult<PrinterDto[]>>; printDashboard(input?: { printerName?: string | null; silent?: boolean }): Promise<IpcResult<PrintDashboardResultDto>> };
  pos: {
    getStatus(): Promise<IpcResult<PosStatusDto>>;
    listTerminals(): Promise<IpcResult<PosTerminalDto[]>>;
    saveTerminal(input: { id?: string; terminalCode?: string; displayName: string; provider: string; connectionType: PosConnectionTypeDto; endpoint?: string | null; port?: number | null; pairingKey?: string | null }): Promise<IpcResult<PosTerminalDto>>;
    testConnection(input: { terminalId: string }): Promise<IpcResult<PosConnectionResultDto>>;
  };
  settings: { get(): Promise<IpcResult<Record<string, unknown>>>; update(input: Record<string, string | number | boolean>): Promise<IpcResult<Record<string, unknown>>> };
  system: { getLoginStatus(): Promise<IpcResult<LoginStatusDto>>; getHealth(): Promise<IpcResult<SystemHealthDto>>; runIntegrityCheck(): Promise<IpcResult<{ result: string }>> };
  window: { minimize(): Promise<IpcResult<{ ok: true }>>; toggleMaximize(): Promise<IpcResult<{ ok: true }>>; close(): Promise<IpcResult<{ ok: true }>> };
};

declare global {
  interface Window {
    bakiyeDefter: BakiyeDefterApi;
  }
}
