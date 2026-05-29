export function formatTRY(amountCents: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(amountCents / 100);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function parseAmountToCents(value: string): number {
  return Math.round(Number(value.trim().replace(/\./g, "").replace(",", ".")) * 100);
}

export function ledgerLabel(eventType: string): string {
  return { DebtAdded: "Borç", PaymentReceived: "Tahsilat", TransactionVoided: "İptal", AdjustmentCreated: "Düzeltme", OpeningBalanceCreated: "Açılış" }[eventType] ?? eventType;
}
