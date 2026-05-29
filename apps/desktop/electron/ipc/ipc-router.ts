import os from "node:os";
import { BrowserWindow, ipcMain } from "electron";
import { z } from "zod";
import type { ApplicationServices } from "@application/container";
import { normalizeUnknownError, PrinterError } from "@shared/errors";
import { ok } from "@shared/result";
import type { IpcChannel } from "../preload/api-contract";
import { buildDashboardPrintHtml } from "./printer-html";

export type IpcRegistrar = <TInput, TOutput>(channel: IpcChannel, schema: z.ZodType<TInput>, handler: (input: TInput) => TOutput | Promise<TOutput>) => void;

export function registerIpcRouter(services: ApplicationServices) {
  const register: IpcRegistrar = (channel, schema, handler) => {
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        return ok(await handler(schema.parse(payload ?? {})));
      } catch (error) {
        return normalizeUnknownError(error);
      }
    });
  };

  register("auth:get-state", z.object({}), () => services.auth.getState());
  register("auth:create-first-owner", z.object({ username: z.string().min(3), displayName: z.string().min(2), password: z.string().min(8) }), (input) => services.auth.createFirstOwner(input));
  const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    roleHint: z.enum(["owner", "cashier"]).optional(),
    rememberDevice: z.boolean().optional()
  });
  register("auth:login", loginSchema, (input) => services.auth.login({ ...input, deviceName: os.hostname() }));
  register("auth:logout", z.object({}), () => {
    services.auth.logout();
    return { loggedOut: true as const };
  });
  register("auth:get-current-user", z.object({}), () => services.auth.getState().currentUser);
  register("auth:lock", z.object({}), () => {
    services.auth.logout();
    return { locked: true };
  });
  register("auth:unlock", z.object({ username: z.string(), password: z.string() }), (input) => services.auth.login(input));

  const risk = z.enum(["standard", "trusted", "watch", "blocked"]);
  register("customers:create", z.object({ displayName: z.string().min(2), phone: z.string().optional().nullable(), note: z.string().optional().nullable(), riskStatus: risk.optional(), creditLimitCents: z.number().int().nonnegative().optional(), paymentTermsDays: z.number().int().min(0).max(365).optional() }), (input) => services.customers.create(input));
  register("customers:update", z.object({ customerId: z.string(), displayName: z.string().min(2), phone: z.string().optional().nullable(), note: z.string().optional().nullable(), riskStatus: risk.optional(), creditLimitCents: z.number().int().nonnegative().optional(), paymentTermsDays: z.number().int().min(0).max(365).optional() }), (input) => services.customers.update(input));
  register("customers:archive", z.object({ customerId: z.string() }), (input) => services.customers.archive(input.customerId));
  register("customers:search", z.object({ query: z.string().optional(), onlyDebtors: z.boolean().optional(), sortBy: z.enum(["name", "balance", "lastLedgerAt"]).optional(), limit: z.number().int().positive().max(200).optional() }), (input) => services.customers.search(input));
  register("customers:get-by-id", z.object({ customerId: z.string() }), (input) => services.customers.getById(input.customerId));
  register("customers:get-ledger", z.object({ customerId: z.string() }), (input) => services.customers.getLedger(input.customerId));

  register("transactions:add-debt", z.object({ customerId: z.string(), amountCents: z.number().int().positive(), description: z.string().optional().nullable(), dueAt: z.string().optional().nullable(), idempotencyKey: z.string().optional() }), (input) => services.transactions.addDebt(input));
  register("transactions:receive-payment", z.object({ customerId: z.string(), amountCents: z.number().int().positive(), description: z.string().optional().nullable(), paymentMethod: z.enum(["cash", "card", "transfer"]).optional(), idempotencyKey: z.string().optional() }), (input) => services.transactions.receivePayment(input));
  register("transactions:void", z.object({ ledgerEntryId: z.string(), reason: z.string().min(3) }), (input) => services.transactions.void(input));
  register("transactions:undo-last", z.object({}), () => services.transactions.undoLast());
  register("transactions:get-history", z.object({ limit: z.number().int().positive().max(200).optional() }), (input) => services.transactions.getHistory(input.limit));

  register("reports:get-dashboard", z.object({}), () => services.dashboard.getDashboard());
  register("quick-actions:get-summary", z.object({}), () => ({ dashboard: services.dashboard.getDashboard(), recentTransactions: services.transactions.getHistory(10), openDebtors: services.customers.search({ onlyDebtors: true, sortBy: "balance", limit: 10 }) }));
  register("backup:create", z.object({ targetDir: z.string().optional() }), (input) => services.backup.createManualBackup(input.targetDir));
  register("backup:list", z.object({}), () => services.backup.list());
  const posConnectionType = z.enum(["manual", "tcp", "serial", "usb"]);
  register("pos:get-status", z.object({}), () => services.pos.getStatus());
  register("pos:list-terminals", z.object({}), () => services.pos.listTerminals());
  register(
    "pos:save-terminal",
    z.object({
      id: z.string().optional(),
      terminalCode: z.string().optional(),
      displayName: z.string().min(2),
      provider: z.string().min(2),
      connectionType: posConnectionType,
      endpoint: z.string().optional().nullable(),
      port: z.number().int().positive().max(65535).optional().nullable(),
      pairingKey: z.string().optional().nullable()
    }),
    (input) => services.pos.saveTerminal(input)
  );
  register("pos:test-connection", z.object({ terminalId: z.string() }), (input) => services.pos.testConnection(input.terminalId));
  register("settings:get", z.object({}), () => services.settings.getAll());
  register("settings:update", z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), (input) => services.settings.update(input));
  register("system:get-login-status", z.object({}), () => services.systemHealth.getLoginStatus());
  register("system:get-health", z.object({}), () => services.systemHealth.getHealth());
  register("system:run-integrity-check", z.object({}), () => services.systemHealth.runIntegrityCheck());
  ipcMain.handle("printer:list", async (event) => {
    try {
      const printers = await event.sender.getPrintersAsync();
      return ok(printers.map((printer) => ({ name: printer.name, displayName: printer.displayName, description: printer.description ?? "", isDefault: false, status: "" })));
    } catch (error) {
      return normalizeUnknownError(new PrinterError("Printer list failed", { message: error instanceof Error ? error.message : String(error) }));
    }
  });
  ipcMain.handle("printer:print-dashboard", async (event, payload) => {
    const schema = z.object({ printerName: z.string().optional().nullable(), silent: z.boolean().optional() });
    let prepared: ReturnType<typeof services.printer.prepareDashboardPrint> | null = null;
    try {
      const input = schema.parse(payload ?? {});
      prepared = services.printer.prepareDashboardPrint({ printerName: input.printerName ?? null });
      const result = await printHtml({
        owner: BrowserWindow.fromWebContents(event.sender),
        html: buildDashboardPrintHtml(prepared),
        printerName: input.printerName ?? null,
        silent: input.silent ?? false
      });
      services.printer.completePrintJob({ printJobId: prepared.jobId, status: result.status, actorUserId: prepared.actorUserId, printerName: input.printerName ?? null });
      return ok({ jobId: prepared.jobId, status: result.status, printerName: input.printerName ?? null, printedAt: new Date().toISOString(), documentTitle: prepared.documentTitle });
    } catch (error) {
      if (prepared) {
        services.printer.failPrintJob({ printJobId: prepared.jobId, actorUserId: prepared.actorUserId, reason: error instanceof Error ? error.message : String(error), printerName: prepared.printerName });
      }
      return normalizeUnknownError(error);
    }
  });
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
    return ok({ ok: true as const });
  });
  ipcMain.handle("window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window?.isMaximized()) window.unmaximize();
    else window?.maximize();
    return ok({ ok: true as const });
  });
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return ok({ ok: true as const });
  });
}

async function printHtml(input: { owner: BrowserWindow | null; html: string; printerName?: string | null; silent: boolean }): Promise<{ status: "printed" | "cancelled" }> {
  const printWindow = new BrowserWindow({
    parent: input.owner ?? undefined,
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(input.html)}`);
    return await new Promise((resolve, reject) => {
      printWindow.webContents.print({ silent: input.silent, printBackground: true, deviceName: input.printerName ?? undefined }, (success, failureReason) => {
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
