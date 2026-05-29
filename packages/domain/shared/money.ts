import { ValidationError } from "@shared/errors";

export function assertPositiveCents(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError("Amount must be positive", { amountCents });
  }
}

export function formatTRY(amountCents: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amountCents / 100);
}
