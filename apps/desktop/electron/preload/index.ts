import { contextBridge } from "electron";
import type { BakiyeDefterApi } from "./api-contract";
import { invoke } from "./safe-ipc";

const api: BakiyeDefterApi = {
  auth: {
    getState: () => invoke("auth:get-state"),
    createFirstOwner: (input) => invoke("auth:create-first-owner", input),
    login: (input) => invoke("auth:login", input),
    logout: () => invoke("auth:logout"),
    getCurrentUser: () => invoke("auth:get-current-user")
  },
  customers: {
    create: (input) => invoke("customers:create", input),
    update: (input) => invoke("customers:update", input),
    archive: (input) => invoke("customers:archive", input),
    search: (input) => invoke("customers:search", input),
    getById: (input) => invoke("customers:get-by-id", input),
    getLedger: (input) => invoke("customers:get-ledger", input)
  },
  transactions: {
    addDebt: (input) => invoke("transactions:add-debt", input),
    receivePayment: (input) => invoke("transactions:receive-payment", input),
    void: (input) => invoke("transactions:void", input),
    undoLast: () => invoke("transactions:undo-last"),
    getHistory: (input) => invoke("transactions:get-history", input ?? {})
  },
  quickActions: { getSummary: () => invoke("quick-actions:get-summary") },
  reports: { getDashboard: () => invoke("reports:get-dashboard") },
  backup: { create: (input) => invoke("backup:create", input ?? {}), list: () => invoke("backup:list") },
  printer: { list: () => invoke("printer:list"), printDashboard: (input) => invoke("printer:print-dashboard", input ?? {}) },
  pos: {
    getStatus: () => invoke("pos:get-status"),
    listTerminals: () => invoke("pos:list-terminals"),
    saveTerminal: (input) => invoke("pos:save-terminal", input),
    testConnection: (input) => invoke("pos:test-connection", input)
  },
  settings: { get: () => invoke("settings:get"), update: (input) => invoke("settings:update", input) },
  system: { getLoginStatus: () => invoke("system:get-login-status"), getHealth: () => invoke("system:get-health"), runIntegrityCheck: () => invoke("system:run-integrity-check") },
  window: {
    minimize: () => invoke("window:minimize"),
    toggleMaximize: () => invoke("window:toggle-maximize"),
    close: () => invoke("window:close")
  }
};

contextBridge.exposeInMainWorld("bakiyeDefter", api);
