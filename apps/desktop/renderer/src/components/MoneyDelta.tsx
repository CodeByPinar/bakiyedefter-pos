import clsx from "clsx";
import { formatTRY } from "@renderer/lib/format";

export function MoneyDelta({ amountCents, direction }: { amountCents: number; direction: "debit" | "credit" | "neutral" }) {
  return <span className={clsx("money-delta", `money-delta--${direction}`)}>{formatTRY(amountCents)}</span>;
}
