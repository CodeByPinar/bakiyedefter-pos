import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ChevronDown,
  CreditCard,
  DatabaseBackup,
  FileText,
  MoreVertical,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings,
  StickyNote,
  Undo2,
  UserSearch,
  Users,
  Wallet,
  WalletCards
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@renderer/components/Button";
import { MoneyDelta } from "@renderer/components/MoneyDelta";
import { StateBlock } from "@renderer/components/StateBlock";
import { formatDateTime, formatTRY, ledgerLabel } from "@renderer/lib/format";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";
import type { CustomerPageMode } from "@renderer/features/customers/CustomersPage";

type DashboardPageProps = {
  onNavigate(page: string): void;
  onCustomerMode(mode: CustomerPageMode): void;
  onPrint(): void;
  printing: boolean;
};

export function DashboardPage({ onNavigate, onCustomerMode, onPrint, printing }: DashboardPageProps) {
  const queryClient = useQueryClient();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => unwrapIpc(getDesktopApi().reports.getDashboard()) });
  const recent = useQuery({ queryKey: ["transactions", "history", 12], queryFn: () => unwrapIpc(getDesktopApi().transactions.getHistory({ limit: 12 })) });
  const customers = useQuery({ queryKey: ["dashboard", "customers"], queryFn: () => unwrapIpc(getDesktopApi().customers.search({ sortBy: "balance", limit: 8 })) });
  const undoLast = useMutation({ mutationFn: () => unwrapIpc(getDesktopApi().transactions.undoLast()), onSuccess: async () => queryClient.invalidateQueries() });

  useEffect(() => {
    if (!moreMenuOpen) return undefined;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (moreMenuRef.current?.contains(event.target as Node)) return;
      setMoreMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreMenuOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreMenuOpen]);

  if (dashboard.isLoading) return <StateBlock title="Dashboard hazırlanıyor" body="Metrikler ledger kayıtlarından hesaplanıyor." />;
  if (dashboard.isError) return <StateBlock title="Dashboard açılamadı" body={dashboard.error.message} />;
  if (!dashboard.data) return <StateBlock title="Dashboard verisi alınamadı" />;

  const metrics = dashboard.data;

  return (
    <div className="dashboard-grid">
      <section className="action-bar">
        <div className="dashboard-search">
          <Search size={18} />
          <input placeholder="Cari adı, telefon veya cari kod ara" onFocus={() => openCustomerMode("browse")} />
          <kbd>F2</kbd>
        </div>
        <button className="action-select" onClick={() => onNavigate("quick")}>
          <WalletCards size={17} />
          <span>Hızlı İşlem</span>
          <ChevronDown size={15} />
        </button>
        <Button icon={<StickyNote size={17} />} disabled>
          Not Ekle
        </Button>
        <Button icon={<Printer size={17} />} onClick={onPrint} disabled={printing}>
          {printing ? "Yazdırılıyor" : "Yazdır"}
        </Button>
        <div className="action-menu" ref={moreMenuRef}>
          <button className="icon-button" aria-label="Daha fazla" aria-haspopup="menu" aria-expanded={moreMenuOpen} onClick={() => setMoreMenuOpen((open) => !open)}>
            <MoreVertical size={18} />
          </button>
          {moreMenuOpen ? (
            <div className="action-menu__panel" role="menu">
              <MenuAction icon={<ReceiptText size={16} />} label="Hesap hareketleri" onClick={() => runMenuAction(() => onNavigate("ledger"))} />
              <MenuAction icon={<DatabaseBackup size={16} />} label="Yedekleme merkezi" onClick={() => runMenuAction(() => onNavigate("backup"))} />
              <MenuAction icon={<Settings size={16} />} label="Ayarlar" onClick={() => runMenuAction(() => onNavigate("settings"))} />
              <MenuAction icon={<Printer size={16} />} label={printing ? "Yazdırılıyor" : "Dashboard yazdır"} disabled={printing} onClick={() => runMenuAction(onPrint)} />
              <MenuAction icon={<Undo2 size={16} />} label={undoLast.isPending ? "Geri alınıyor" : "Son işlemi geri al"} tone="danger" disabled={undoLast.isPending} onClick={() => runMenuAction(() => undoLast.mutate())} />
            </div>
          ) : null}
        </div>
      </section>

      <section className="quick-action-strip">
        <ActionCard shortcut="F2" title="Cari Ara" icon={<UserSearch size={22} />} tone="blue" onClick={() => openCustomerMode("browse")} />
        <ActionCard shortcut="F5" title="Borç Ekle" icon={<Plus size={22} />} tone="orange" onClick={() => openCustomerMode("addDebt")} />
        <ActionCard shortcut="F6" title="Ödeme Al" icon={<CreditCard size={22} />} tone="green" onClick={() => openCustomerMode("receivePayment")} />
        <ActionCard shortcut="F8" title="Gün Sonu" icon={<CalendarDays size={22} />} tone="blue" onClick={() => onNavigate("reports")} />
        <ActionCard shortcut="Ctrl+Z" title="Son İşlemi Geri Al" icon={<Undo2 size={22} />} tone="red" onClick={() => undoLast.mutate()} />
      </section>

      {undoLast.isError ? <div className="toast toast--error dashboard-full">{undoLast.error.message}</div> : null}

      <section className="stat-grid">
        <StatCard title="Toplam Cari Sayısı" value={String(metrics.totalCustomers)} detail={`${metrics.activeCustomers} aktif · ${metrics.archivedCustomers} pasif`} icon={<Users size={20} />} tone="blue" />
        <StatCard title="Toplam Borç (Veresiye)" value={formatTRY(metrics.totalReceivableCents)} detail={`${metrics.debtorCustomers} borçlu cari`} icon={<Wallet size={20} />} tone="orange" />
        <StatCard title="Bugün Tahsilat" value={formatTRY(metrics.todayPaymentCents)} detail={`${metrics.todayPaymentCount} işlem`} icon={<CreditCard size={20} />} tone="green" />
        <StatCard title="Bugün Borç Ekleme" value={formatTRY(metrics.todayDebtCents)} detail={`${metrics.todayDebtCount} işlem`} icon={<Plus size={20} />} tone="orange" />
        <StatCard title="Kasa Bakiyesi" value={formatTRY(metrics.cashBalanceCents)} detail="Bugünkü tahsilat toplamı" icon={<WalletCards size={20} />} tone="blue" />
      </section>

      <section className="dashboard-panel customer-table-panel">
        <header className="panel-toolbar">
          <div>
            <h2>Cari Hesaplar</h2>
            <p>Bakiyeye göre öne çıkan cariler.</p>
          </div>
          <div className="panel-tools">
            <button className="filter-button">Borç durumuna göre <ChevronDown size={14} /></button>
            <div className="table-search"><Search size={15} /><span>Tablo içi ara</span></div>
          </div>
        </header>
        {customers.isLoading ? <StateBlock title="Cariler yükleniyor" /> : null}
        {customers.isError ? <StateBlock title="Cari tablosu alınamadı" body={customers.error.message} /> : null}
        {customers.data?.length === 0 ? <StateBlock title="Cari hesabı yok" body="İlk cari eklendiğinde tablo otomatik dolar." /> : null}
        {customers.data && customers.data.length > 0 ? (
          <>
            <div className="business-table customer-table">
              <div className="business-table__head">
                <span>Cari Kod</span>
                <span>Cari Adı</span>
                <span>Telefon</span>
                <span>Borç</span>
                <span>Son İşlem</span>
                <span>Gün</span>
              </div>
              {customers.data.map((customer) => (
                <div className="business-table__row" key={customer.id}>
                  <span>{customer.customerCode}</span>
                  <strong>{customer.displayName}</strong>
                  <span>{customer.phone || "-"}</span>
                  <span className="debt-text">{formatTRY(customer.currentBalanceCents)}</span>
                  <span>{formatDateTime(customer.lastLedgerAt)}</span>
                  <span>{daysSince(customer.lastLedgerAt)}</span>
                </div>
              ))}
            </div>
            <footer className="table-footer">
              <span>{customers.data.length} kayıt</span>
              <strong>Toplam borç: {formatTRY(metrics.totalReceivableCents)}</strong>
              <button onClick={() => onNavigate("customers")}>Tümünü gör</button>
            </footer>
          </>
        ) : null}
      </section>

      <section className="dashboard-panel movement-panel">
        <header className="panel-toolbar">
          <div>
            <h2>Son Hesap Hareketleri</h2>
            <p>Ledger kayıtlarından anlık hareketler.</p>
          </div>
          <button onClick={() => onNavigate("ledger")}>Tümünü gör</button>
        </header>
        {recent.isLoading ? <StateBlock title="Hareketler yükleniyor" /> : null}
        {recent.isError ? <StateBlock title="Hareketler alınamadı" body={recent.error.message} /> : null}
        {recent.data?.length === 0 ? <StateBlock title="Henüz hareket yok" body="Borç veya tahsilat kaydedildiğinde burada görünür." /> : null}
        {recent.data && recent.data.length > 0 ? (
          <div className="business-table movement-table">
            <div className="business-table__head">
              <span>Saat</span>
              <span>İşlem</span>
              <span>Cari</span>
              <span>Açıklama</span>
              <span>Tutar</span>
              <span>Tür</span>
            </div>
            {recent.data.map((entry) => (
              <div className="business-table__row" key={entry.id}>
                <span>{timeOnly(entry.occurredAt)}</span>
                <span>{ledgerLabel(entry.eventType)}</span>
                <strong>{entry.customerName}</strong>
                <span>{entry.description || "-"}</span>
                <MoneyDelta amountCents={entry.amountCents} direction={entry.direction} />
                <span className={`type-chip type-chip--${entry.direction}`}>{entry.eventType === "PaymentReceived" ? "Tahsilat" : entry.eventType === "DebtAdded" ? "Borç Ekle" : ledgerLabel(entry.eventType)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="bottom-widget-grid">
        <Widget title="Veresiye Yaşlandırma" icon={<FileText size={17} />}>
          <AgingRow label="0-30 gün" value={metrics.debtAging.currentThirtyCents} />
          <AgingRow label="31-60 gün" value={metrics.debtAging.thirtyOneSixtyCents} />
          <AgingRow label="61-90 gün" value={metrics.debtAging.sixtyOneNinetyCents} />
          <AgingRow label="90+ gün" value={metrics.debtAging.overNinetyCents} />
        </Widget>
        <Widget title="Yaklaşan Tahsilatlar" icon={<CalendarDays size={17} />}>
          {metrics.topDebtors.length === 0 ? <p className="widget-empty">Planlanmış tahsilat yok.</p> : metrics.topDebtors.slice(0, 3).map((customer) => <div className="widget-row" key={customer.customerId}><span>{customer.displayName}</span><strong>{formatTRY(customer.balanceCents)}</strong></div>)}
        </Widget>
        <Widget title="Hatırlatmalar" icon={<StickyNote size={17} />}>
          <div className="reminder-line">{metrics.noPaymentThirtyDays} cari 30 gündür ödeme yapmadı.</div>
          <div className="reminder-line">{metrics.riskyCustomers} riskli cari izleniyor.</div>
          <div className="reminder-line">Gün sonu raporu bekliyor.</div>
        </Widget>
        <Widget title="Hızlı Notlar" icon={<StickyNote size={17} />}>
          <textarea placeholder="Bu alan not servisi bağlandığında kaydedilecek." disabled />
        </Widget>
      </section>
    </div>
  );

  function openCustomerMode(mode: CustomerPageMode) {
    onCustomerMode(mode);
    onNavigate("customers");
  }

  function runMenuAction(action: () => void) {
    action();
    setMoreMenuOpen(false);
  }
}

function MenuAction({ icon, label, tone, disabled, onClick }: { icon: ReactNode; label: string; tone?: "danger"; disabled?: boolean; onClick(): void }) {
  return (
    <button className={tone === "danger" ? "action-menu__item action-menu__item--danger" : "action-menu__item"} role="menuitem" disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ActionCard({ shortcut, title, icon, tone, onClick }: { shortcut: string; title: string; icon: ReactNode; tone: "blue" | "orange" | "green" | "red"; onClick(): void }) {
  return (
    <button className={`action-card action-card--${tone}`} onClick={onClick}>
      <span>{icon}</span>
      <strong>{title}</strong>
      <kbd>{shortcut}</kbd>
    </button>
  );
}

function StatCard({ title, value, detail, icon, tone }: { title: string; value: string; detail: string; icon: ReactNode; tone: "blue" | "orange" | "green" }) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__top">
        <span>{title}</span>
        <b>{icon}</b>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Widget({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <article className="dashboard-widget">
      <header>
        <span>{icon}</span>
        <strong>{title}</strong>
      </header>
      {children}
    </article>
  );
}

function AgingRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="widget-row">
      <span>{label}</span>
      <strong>{formatTRY(value)}</strong>
    </div>
  );
}

function daysSince(value: string | null) {
  if (!value) return "-";
  const diffMs = Date.now() - new Date(value).getTime();
  return `${Math.max(0, Math.floor(diffMs / 86_400_000))} gün`;
}

function timeOnly(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

