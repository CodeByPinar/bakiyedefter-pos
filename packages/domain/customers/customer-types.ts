export type CustomerRiskStatus = "standard" | "trusted" | "watch" | "blocked";
export type Customer = {
  id: string;
  customerCode: string;
  displayName: string;
  phone: string | null;
  normalizedPhone: string | null;
  note: string | null;
  riskStatus: CustomerRiskStatus;
  creditLimitCents: number;
  paymentTermsDays: number;
  lastContactedAt: string | null;
  currentBalanceCents: number;
  lastLedgerAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAccountSummary = {
  lastPaymentAt: string | null;
  debtEntryCount: number;
  paymentEntryCount: number;
  overdueDebtCents: number;
  creditUsagePercent: number | null;
};

export type CustomerListItem = Customer & CustomerAccountSummary;
