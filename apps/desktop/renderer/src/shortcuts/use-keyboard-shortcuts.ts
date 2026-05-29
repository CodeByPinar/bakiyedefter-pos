import { useEffect } from "react";

export function useKeyboardShortcuts(handlers: { searchCustomers(): void; addDebt(): void; receivePayment(): void; endOfDay(): void; print(): void; undoLast(): void; save(): void; cancel(): void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") { event.preventDefault(); handlers.searchCustomers(); }
      if (event.key === "F5") { event.preventDefault(); handlers.addDebt(); }
      if (event.key === "F6") { event.preventDefault(); handlers.receivePayment(); }
      if (event.key === "F8") { event.preventDefault(); handlers.endOfDay(); }
      if (event.ctrlKey && event.key.toLocaleLowerCase("tr-TR") === "p") { event.preventDefault(); handlers.print(); }
      if (event.ctrlKey && event.key.toLocaleLowerCase("tr-TR") === "z") { event.preventDefault(); handlers.undoLast(); }
      if (event.ctrlKey && event.key.toLocaleLowerCase("tr-TR") === "s") { event.preventDefault(); handlers.save(); }
      if (event.key === "Escape") handlers.cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
