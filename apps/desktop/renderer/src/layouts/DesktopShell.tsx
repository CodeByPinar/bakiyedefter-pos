import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ChevronRight, CircleHelp, CreditCard, DatabaseBackup, FileClock, Home, LogOut, Maximize2, Minus, Package, ReceiptText, Settings, Users, Wallet, WalletCards, X } from "lucide-react";
import { BrandLogoMark } from "@renderer/components/BrandLogoMark";
import { Button } from "@renderer/components/Button";
import { StateBlock } from "@renderer/components/StateBlock";
import { DashboardPage } from "@renderer/features/dashboard/DashboardPage";
import { CustomersPage, type CustomerPageMode } from "@renderer/features/customers/CustomersPage";
import { LedgerPage } from "@renderer/features/customers/LedgerPage";
import { QuickActionsPage } from "@renderer/features/quick-actions/QuickActionsPage";
import { BackupPage } from "@renderer/features/system/BackupPage";
import { SettingsPage } from "@renderer/features/system/SettingsPage";
import { SystemHealthPage } from "@renderer/features/system/SystemHealthPage";
import { formatDateTime } from "@renderer/lib/format";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";
import { useKeyboardShortcuts } from "@renderer/shortcuts/use-keyboard-shortcuts";

type PageKey =
  | "dashboard"
  | "customers"
  | "payments"
  | "debts"
  | "ledger"
  | "cash"
  | "reports"
  | "products"
  | "settings"
  | "backup"
  | "support"
  | "quick"
  | "health";

const navItems: Array<{ key: PageKey; label: string; icon: typeof Home; implemented: boolean }> = [
  { key: "dashboard", label: "Ana Sayfa", icon: Home, implemented: true },
  { key: "customers", label: "Cari Hesaplar", icon: Users, implemented: true },
  { key: "payments", label: "Tahsilat İşlemleri", icon: CreditCard, implemented: true },
  { key: "debts", label: "Borç İşlemleri", icon: Wallet, implemented: true },
  { key: "ledger", label: "Hesap Hareketleri", icon: ReceiptText, implemented: true },
  { key: "cash", label: "Kasa İşlemleri", icon: WalletCards, implemented: false },
  { key: "reports", label: "Raporlar", icon: BarChart3, implemented: false },
  { key: "products", label: "Ürün/Hizmetler", icon: Package, implemented: false },
  { key: "settings", label: "Ayarlar", icon: Settings, implemented: true },
  { key: "backup", label: "Yedekleme", icon: DatabaseBackup, implemented: true },
  { key: "support", label: "Destek", icon: CircleHelp, implemented: false }
];

export function DesktopShell({ user, onLogout }: { user: { displayName: string; role: string }; onLogout(): void }) {
  const queryClient = useQueryClient();
  const [activePage, setActivePage] = useState<PageKey>("dashboard");
  const [customerMode, setCustomerMode] = useState<CustomerPageMode>("browse");
  const health = useQuery({ queryKey: ["system", "health", "statusbar"], queryFn: () => unwrapIpc(getDesktopApi().system.getHealth()), refetchInterval: 30_000 });
  const backupNow = useMutation({ mutationFn: () => unwrapIpc(getDesktopApi().backup.create()), onSuccess: async () => queryClient.invalidateQueries() });
  const logout = useMutation({ mutationFn: () => unwrapIpc(getDesktopApi().auth.logout()), onSuccess: onLogout });
  const undoMutation = useMutation({ mutationFn: () => unwrapIpc(getDesktopApi().transactions.undoLast()), onSuccess: async () => queryClient.invalidateQueries() });
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const printDashboard = useMutation({
    mutationFn: printDashboardSummary,
    onSuccess: (result) => setPrintMessage(result.status === "printed" ? "Yazdırma tamamlandı." : "Yazdırma iptal edildi.")
  });

  useEffect(() => {
    if (!printMessage) return undefined;
    const timer = window.setTimeout(() => setPrintMessage(null), 4200);
    return () => window.clearTimeout(timer);
  }, [printMessage]);

  const handlers = useMemo(
    () => ({
      searchCustomers: () => openCustomerMode("browse"),
      addDebt: () => openCustomerMode("addDebt"),
      receivePayment: () => openCustomerMode("receivePayment"),
      endOfDay: () => setActivePage("reports"),
      print: () => printDashboard.mutate(),
      undoLast: () => undoMutation.mutate(),
      save: () => undefined,
      cancel: () => setCustomerMode("browse")
    }),
    [printDashboard, undoMutation]
  );
  useKeyboardShortcuts(handlers);

  const activeItem = navItems.find((entry) => entry.key === activePage);

  return (
    <div className="desktop-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="brand-mark brand-mark--small">
            <BrandLogoMark size="small" />
          </div>
          <div>
            <strong>BakiyeDefter POS</strong>
            <span>Finansal İşletim</span>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Ana navigasyon">
          {navItems.map((entry) => {
            const Icon = entry.icon;
            return (
              <button key={entry.key} className={activePage === entry.key ? "nav-item nav-item--active" : "nav-item"} onClick={() => handleNavigation(entry.key)}>
                <Icon size={17} />
                <span>{entry.label}</span>
                {activePage === entry.key ? <ChevronRight size={15} /> : null}
              </button>
            );
          })}
        </nav>

        <section className="shortcut-card" aria-label="Kısayollar">
          <strong>Kısayollar</strong>
          <ShortcutRow keys="F2" label="Cari Ara" />
          <ShortcutRow keys="F5" label="Borç Ekle" />
          <ShortcutRow keys="F6" label="Ödeme Al" />
          <ShortcutRow keys="F8" label="Gün Sonu" />
          <ShortcutRow keys="Ctrl+Z" label="Son İşlemi Geri Al" />
        </section>

        <div className="sidebar__user">
          <span className="status-dot" />
          <div>
            <strong>{user.displayName}</strong>
            <span>{roleLabel(user.role)} · Merkez Şube</span>
          </div>
          <Button variant="quiet" icon={<LogOut size={17} />} onClick={() => logout.mutate()} aria-label="Çıkış">
            Çıkış
          </Button>
        </div>
      </aside>

      <main className="workspace">
        <header className="app-titlebar">
          <div className="app-titlebar__identity">
            <strong>BakiyeDefter POS</strong>
            <span>v1.6.3</span>
            <span className="demo-pill">Demo Sürümü</span>
            <span className="offline-pill">Çevrimdışı Mod</span>
          </div>
          <div className="window-controls">
            <button onClick={() => getDesktopApi().window.minimize()} aria-label="Küçült">
              <Minus size={15} />
            </button>
            <button onClick={() => getDesktopApi().window.toggleMaximize()} aria-label="Büyüt">
              <Maximize2 size={14} />
            </button>
            <button className="window-controls__close" onClick={() => getDesktopApi().window.close()} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
        </header>

        <section className="page-frame">
          {undoMutation.isError ? <div className="toast toast--error">{undoMutation.error.message}</div> : null}
          {printMessage ? <div className="toast">{printMessage}</div> : null}
          {printDashboard.isError ? <div className="toast toast--error">{printDashboard.error.message}</div> : null}
          {activePage === "dashboard" ? <DashboardPage onNavigate={handleNavigation} onCustomerMode={setCustomerMode} onPrint={() => printDashboard.mutate()} printing={printDashboard.isPending} /> : null}
          {activePage === "quick" ? <QuickActionsPage onNavigate={(page) => handleNavigation(page as PageKey)} onCustomerMode={setCustomerMode} onPrint={() => printDashboard.mutate()} printing={printDashboard.isPending} /> : null}
          {activePage === "customers" || activePage === "payments" || activePage === "debts" ? <CustomersPage mode={customerMode} onModeChange={setCustomerMode} /> : null}
          {activePage === "ledger" ? <LedgerPage /> : null}
          {activePage === "backup" ? <BackupPage /> : null}
          {activePage === "health" ? <SystemHealthPage /> : null}
          {activePage === "settings" ? <SettingsPage /> : null}
          {!activeItem?.implemented ? (
            <StateBlock title={`${activeItem?.label} modülü hazır değil`} body="Bu ekran sahte veri göstermiyor. İlgili servis ve veritabanı akışı eklendiğinde gerçek kayıtlarla açılacak." />
          ) : null}
        </section>

        <footer className="status-bar">
          <StatusItem label="Sistem Durumu" value={health.data?.databaseStatus === "ok" ? "Sağlıklı" : "Kontrol gerekli"} healthy={health.data?.databaseStatus === "ok"} />
          <StatusItem label="Veritabanı" value={health.data?.integrityCheck ?? "kontrol"} healthy={health.data?.integrityCheck === "ok"} />
          <div className="status-item">
            <span>Yedekleme</span>
            <strong>{formatDateTime(health.data?.lastBackupAt ?? null)}</strong>
            <button onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>Yedekle</button>
          </div>
          <div className="status-item">
            <span>Senkronizasyon</span>
            <strong>{health.data?.pendingSyncCount ?? 0} bekleyen</strong>
            <button disabled>Şimdi senkronize et</button>
          </div>
          <StatusItem label="Offline Mod" value="Aktif" healthy />
          <LiveClock />
        </footer>
      </main>
    </div>
  );

  function handleNavigation(page: PageKey) {
    if (page === "payments") {
      openCustomerMode("receivePayment");
      return;
    }
    if (page === "debts") {
      openCustomerMode("addDebt");
      return;
    }
    setActivePage(page);
  }

  function openCustomerMode(mode: CustomerPageMode) {
    setCustomerMode(mode);
    setActivePage("customers");
  }
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="shortcut-row">
      <kbd>{keys}</kbd>
      <span>{label}</span>
    </div>
  );
}

function StatusItem({ label, value, healthy }: { label: string; value: string; healthy?: boolean }) {
  return (
    <div className="status-item">
      <span className={healthy ? "status-dot status-dot--inline" : "status-dot status-dot--inline status-dot--warn"} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="status-item status-item--time">
      <FileClock size={15} />
      <strong>{formatDateTime(now.toISOString())}</strong>
    </div>
  );
}

async function printDashboardSummary() {
  const api = getDesktopApi();
  if (!api.printer?.printDashboard) throw new Error("Yazdırma servisi hazır değil. Lütfen uygulamayı yeniden başlatın.");
  return unwrapIpc(api.printer.printDashboard());
}

function roleLabel(role: string) {
  return ({ Owner: "İşletme Sahibi", Admin: "Yönetici", Cashier: "Kasiyer", ReadOnly: "Salt Okuma", Accountant: "Muhasebe" } as Record<string, string>)[role] ?? role;
}


