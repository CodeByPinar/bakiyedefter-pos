export const ledgerEventTypes = ["DebtAdded", "PaymentReceived", "TransactionVoided", "AdjustmentCreated", "RefundCreated", "OpeningBalanceCreated", "BalanceRecalculated"] as const;
export type LedgerEventType = (typeof ledgerEventTypes)[number];
export type LedgerDirection = "debit" | "credit" | "neutral";

export type LedgerEntry = {
  id: string;
  customerId: string;
  eventType: LedgerEventType;
  direction: LedgerDirection;
  amountCents: number;
  description: string | null;
  occurredAt: string;
  createdAt: string;
  createdBy: string | null;
  sourceTransactionId: string;
  voidsLedgerEntryId: string | null;
};
