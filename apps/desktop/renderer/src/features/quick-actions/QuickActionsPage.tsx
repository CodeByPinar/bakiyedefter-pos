import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Bell, CreditCard, FileText, Printer, Search, Undo2, UserPlus, Wallet } from "lucide-react";
import { StateBlock } from "@renderer/components/StateBlock";
import { formatDateTime, formatTRY, ledgerLabel } from "@renderer/lib/format";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";
import type { CustomerPageMode } from "@renderer/features/customers/CustomersPage";

export function QuickActionsPage({ onNavigate, onCustomerMode, onPrint, printing }: { onNavigate(page: string): void; onCustomerMode(mode: CustomerPageMode): void; onPrint(): void; printing: boolean }) {
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ["quick-actions", "summary"], queryFn: () => unwrapIpc(getDesktopApi().quickActions.getSummary()) });
  const undoLast = useMutation({ mutationFn: () => unwrapIpc(getDesktopApi().transactions.undoLast()), onSuccess: async () => queryClient.invalidateQueries() });
  const openCustomerMode = (mode: CustomerPageMode) => { onCustomerMode(mode); onNavigate("customers"); };
  return (
    <div className="page-stack">
      <div className="page-title"><div><h1>Hızlı İşlemler</h1><p>Kasada fare kullanmadan erişilecek ana komutlar.</p></div></div>
      <section className="quick-grid">
        <QuickButton shortcut="F5" label="Borç Ekle" icon={<Wallet size={24} />} onClick={() => openCustomerMode("addDebt")} />
        <QuickButton shortcut="F6" label="Ödeme Al" icon={<CreditCard size={24} />} onClick={() => openCustomerMode("receivePayment")} />
        <QuickButton shortcut="F2" label="Cari Ara" icon={<Search size={24} />} onClick={() => openCustomerMode("browse")} />
        <QuickButton shortcut="Ctrl+P" label={printing ? "Yazdırılıyor" : "Yazdır"} icon={<Printer size={24} />} onClick={onPrint} disabled={printing} />
        <QuickButton shortcut="F8" label="Gün Sonu" icon={<FileText size={24} />} onClick={() => onNavigate("reports")} />
        <QuickButton shortcut="Ctrl+Z" label="Son İşlemi Geri Al" icon={<Undo2 size={24} />} onClick={() => undoLast.mutate()} />
        <QuickButton shortcut="WA" label="WhatsApp Hatırlat" icon={<Bell size={24} />} onClick={() => onNavigate("whatsapp")} />
        <QuickButton shortcut="+" label="Yeni Cari" icon={<UserPlus size={24} />} onClick={() => openCustomerMode("create")} />
      </section>
      {undoLast.isError ? <div className="toast toast--error">{undoLast.error.message}</div> : null}
      {summary.isLoading ? <StateBlock title="Özet hazırlanıyor" /> : null}
      {summary.isError ? <StateBlock title="Özet alınamadı" body={summary.error.message} /> : null}
      {summary.data ? <section className="split-grid"><div className="panel"><header className="panel__header"><div><h2>Açık borçlular</h2><p>En yüksek bakiyeye göre ilk 10.</p></div><strong>{formatTRY(summary.data.dashboard.totalReceivableCents)}</strong></header>{summary.data.openDebtors.length === 0 ? <StateBlock title="Açık borç yok" body="Müşteri borcu eklendiğinde burada görünür." /> : <div className="table-list">{summary.data.openDebtors.map((customer) => <div className="table-row" key={customer.id}><strong>{customer.displayName}</strong><span>{formatTRY(customer.currentBalanceCents)}</span></div>)}</div>}</div><div className="panel"><header className="panel__header"><div><h2>Son 10 işlem</h2><p>Ledger geçmişinden gelir.</p></div></header>{summary.data.recentTransactions.length === 0 ? <StateBlock title="Henüz işlem yok" /> : <div className="table-list">{summary.data.recentTransactions.map((entry) => <div className="table-row" key={entry.id}><span>{ledgerLabel(entry.eventType)}</span><strong>{entry.customerName}</strong><span>{formatDateTime(entry.occurredAt)}</span></div>)}</div>}</div></section> : null}
    </div>
  );
}

function QuickButton({ shortcut, label, icon, onClick, disabled }: { shortcut: string; label: string; icon: ReactNode; onClick(): void; disabled?: boolean }) {
  return <button className="quick-button" onClick={onClick} disabled={disabled}><span className="quick-button__icon">{icon}</span><strong>{label}</strong><kbd>{shortcut}</kbd></button>;
}


