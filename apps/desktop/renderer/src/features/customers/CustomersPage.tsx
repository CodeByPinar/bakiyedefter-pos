import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, BadgeCheck, CalendarClock, CreditCard, Edit3, Phone, Plus, Search, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@renderer/components/Button";
import { FormField } from "@renderer/components/FormField";
import { MoneyDelta } from "@renderer/components/MoneyDelta";
import { StateBlock } from "@renderer/components/StateBlock";
import { formatDateTime, formatTRY, ledgerLabel, parseAmountToCents } from "@renderer/lib/format";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";
import type { CustomerDto, CustomerListItemDto } from "../../../../electron/preload/api-contract";

export type CustomerPageMode = "browse" | "create" | "edit" | "addDebt" | "receivePayment";
type FilterMode = "all" | "debtors" | "risk";

export function CustomersPage({ mode, onModeChange }: { mode: CustomerPageMode; onModeChange(mode: CustomerPageMode): void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const customers = useQuery({
    queryKey: ["customers", "search", query, filterMode],
    queryFn: () => unwrapIpc(getDesktopApi().customers.search({ query, onlyDebtors: filterMode === "debtors", sortBy: filterMode === "all" ? "lastLedgerAt" : "balance", limit: 200 }))
  });

  const visibleCustomers = useMemo(() => (filterMode === "risk" ? customers.data?.filter((customer) => customer.riskStatus === "watch" || customer.riskStatus === "blocked") : customers.data) ?? [], [customers.data, filterMode]);

  useEffect(() => {
    if (!selectedCustomerId && visibleCustomers[0]) setSelectedCustomerId(visibleCustomers[0].id);
    if (selectedCustomerId && visibleCustomers.length > 0 && !visibleCustomers.some((customer) => customer.id === selectedCustomerId)) setSelectedCustomerId(visibleCustomers[0].id);
  }, [selectedCustomerId, visibleCustomers]);

  const selectedCustomer = useMemo(() => visibleCustomers.find((customer) => customer.id === selectedCustomerId) ?? null, [visibleCustomers, selectedCustomerId]);
  const ledger = useQuery({ queryKey: ["customers", selectedCustomerId, "ledger"], queryFn: () => unwrapIpc(getDesktopApi().customers.getLedger({ customerId: selectedCustomerId! })), enabled: Boolean(selectedCustomerId) });

  return (
    <div className="page-stack customer-page">
      <div className="page-title">
        <div>
          <h1>Cari Hesaplar</h1>
          <p>Müşteri profili, kredi limiti, borç vadesi, tahsilat ve değiştirilemeyen cari ekstresi.</p>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => onModeChange("create")}>Yeni Cari</Button>
      </div>

      <section className="customer-workbench">
        <div className="panel customer-list-panel">
          <div className="search-line"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari adı, telefon veya cari kod ara" autoFocus /></div>
          <div className="segmented-tools" role="tablist">
            <button className={filterMode === "all" ? "is-active" : ""} onClick={() => setFilterMode("all")}>Tümü</button>
            <button className={filterMode === "debtors" ? "is-active" : ""} onClick={() => setFilterMode("debtors")}>Borçlular</button>
            <button className={filterMode === "risk" ? "is-active" : ""} onClick={() => setFilterMode("risk")}>Riskli</button>
          </div>
          {customers.isLoading ? <StateBlock title="Cariler yükleniyor" /> : null}
          {customers.isError ? <StateBlock title="Cari listesi alınamadı" body={customers.error.message} /> : null}
          {visibleCustomers.length === 0 && !customers.isLoading ? <StateBlock title="Cari bulunamadı" body="Yeni cari oluşturduğunuzda burada listelenecek." /> : null}
          {visibleCustomers.length > 0 ? <VirtualCustomerList customers={visibleCustomers} selectedCustomerId={selectedCustomerId} onSelect={(customerId) => { setSelectedCustomerId(customerId); onModeChange("browse"); }} /> : null}
        </div>

        <div className="panel customer-detail-panel">
          {mode === "create" ? <CreateCustomerForm onCancel={() => onModeChange("browse")} onCreated={async (customer) => { await queryClient.invalidateQueries({ queryKey: ["customers"] }); setSelectedCustomerId(customer.id); onModeChange("browse"); }} /> : null}
          {mode === "edit" && selectedCustomer ? <CustomerProfileForm customer={selectedCustomer} onCancel={() => onModeChange("browse")} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: ["customers"] }); onModeChange("browse"); }} /> : null}
          {mode !== "create" && mode !== "edit" && !selectedCustomer ? <StateBlock title="Cari seçin" body="Detay ve işlem ekranı için listeden bir cari seçin." /> : null}
          {mode !== "create" && mode !== "edit" && selectedCustomer ? (
            <>
              <CustomerHeader customer={selectedCustomer} onEdit={() => onModeChange("edit")} />
              <CustomerMetrics customer={selectedCustomer} />
              <div className="action-row action-row--toolbar">
                <Button icon={<Wallet size={17} />} variant={mode === "addDebt" ? "primary" : "secondary"} onClick={() => onModeChange("addDebt")}>Borç ekle</Button>
                <Button icon={<CreditCard size={17} />} variant={mode === "receivePayment" ? "primary" : "secondary"} onClick={() => onModeChange("receivePayment")}>Ödeme al</Button>
              </div>
              {mode === "addDebt" ? <TransactionForm kind="debt" customer={selectedCustomer} onDone={() => onModeChange("browse")} /> : null}
              {mode === "receivePayment" ? <TransactionForm kind="payment" customer={selectedCustomer} onDone={() => onModeChange("browse")} /> : null}
              <section className="detail-section">
                <h2>Cari ekstresi</h2>
                {ledger.isLoading ? <StateBlock title="Ekstre yükleniyor" /> : null}
                {ledger.isError ? <StateBlock title="Ekstre alınamadı" body={ledger.error.message} /> : null}
                {ledger.data?.length === 0 ? <StateBlock title="Bu caride hareket yok" body="Borç veya ödeme ekleyince ekstre oluşur." /> : null}
                {ledger.data && ledger.data.length > 0 ? (
                  <div className="ledger-table ledger-table--compact">
                    {ledger.data.map((entry) => <div className="ledger-table__row" key={entry.id}><span>{ledgerLabel(entry.eventType)}</span><MoneyDelta amountCents={entry.amountCents} direction={entry.direction} /><span>{entry.description || "-"}</span><span>{formatDateTime(entry.occurredAt)}</span></div>)}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function CreateCustomerForm({ onCreated, onCancel }: { onCreated(customer: CustomerDto): void; onCancel(): void }) {
  const [form, setForm] = useState({ displayName: "", phone: "", note: "", riskStatus: "standard" as CustomerDto["riskStatus"], creditLimit: "", paymentTermsDays: "30" });
  const mutation = useMutation({
    mutationFn: () => unwrapIpc(getDesktopApi().customers.create({ displayName: form.displayName, phone: form.phone, note: form.note, riskStatus: form.riskStatus, creditLimitCents: amountInputToCents(form.creditLimit), paymentTermsDays: Number(form.paymentTermsDays || 30) })),
    onSuccess: onCreated
  });
  return <CustomerFormShell title="Yeni Cari Oluştur" form={form} setForm={setForm} pending={mutation.isPending} error={mutation.error?.message} submitLabel="Kaydet" onSubmit={() => mutation.mutate()} onCancel={onCancel} />;
}

function CustomerProfileForm({ customer, onSaved, onCancel }: { customer: CustomerListItemDto; onSaved(): void; onCancel(): void }) {
  const [form, setForm] = useState({ displayName: customer.displayName, phone: customer.phone ?? "", note: customer.note ?? "", riskStatus: customer.riskStatus, creditLimit: centsToInput(customer.creditLimitCents), paymentTermsDays: String(customer.paymentTermsDays) });
  const mutation = useMutation({
    mutationFn: () => unwrapIpc(getDesktopApi().customers.update({ customerId: customer.id, displayName: form.displayName, phone: form.phone, note: form.note, riskStatus: form.riskStatus, creditLimitCents: amountInputToCents(form.creditLimit), paymentTermsDays: Number(form.paymentTermsDays || 30) })),
    onSuccess: onSaved
  });
  return <CustomerFormShell title="Cari Profilini Düzenle" form={form} setForm={setForm} pending={mutation.isPending} error={mutation.error?.message} submitLabel="Profili kaydet" onSubmit={() => mutation.mutate()} onCancel={onCancel} />;
}

function CustomerFormShell({ title, form, setForm, submitLabel, pending, error, onSubmit, onCancel }: { title: string; form: CustomerFormState; setForm(next: CustomerFormState): void; submitLabel: string; pending: boolean; error?: string; onSubmit(): void; onCancel(): void }) {
  return (
    <form className="inline-form profile-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <h2>{title}</h2>
      <div className="form-grid">
        <FormField label="Cari adı" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
        <FormField label="Telefon" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <label className="field"><span className="field__label">Risk profili</span><select className="field__input" value={form.riskStatus} onChange={(event) => setForm({ ...form, riskStatus: event.target.value as CustomerDto["riskStatus"] })}><option value="standard">Standart</option><option value="trusted">Güvenilir</option><option value="watch">İzleme</option><option value="blocked">Blokeli</option></select></label>
        <FormField label="Kredi limiti" inputMode="decimal" placeholder="0,00" value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: event.target.value })} />
        <FormField label="Ödeme vadesi (gün)" inputMode="numeric" value={form.paymentTermsDays} onChange={(event) => setForm({ ...form, paymentTermsDays: event.target.value })} />
        <FormField label="Not" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="action-row"><Button type="submit" variant="primary" disabled={pending}>{submitLabel}</Button><Button type="button" variant="quiet" onClick={onCancel}>İptal</Button></div>
    </form>
  );
}

function TransactionForm({ kind, customer, onDone }: { kind: "debt" | "payment"; customer: CustomerListItemDto; onDone(): void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueDate(customer.paymentTermsDays));
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer">("cash");
  const mutation = useMutation({
    mutationFn: () => {
      const amountCents = parseAmountToCents(amount);
      if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("Geçerli bir tutar girin.");
      return kind === "debt"
        ? unwrapIpc(getDesktopApi().transactions.addDebt({ customerId: customer.id, amountCents, description, dueAt: dueAt ? new Date(`${dueAt}T12:00:00`).toISOString() : null }))
        : unwrapIpc(getDesktopApi().transactions.receivePayment({ customerId: customer.id, amountCents, description, paymentMethod }));
    },
    onSuccess: async () => { await queryClient.invalidateQueries(); onDone(); }
  });
  return (
    <form className={`transaction-form transaction-form--${kind}`} onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <div className="transaction-form__header">
        <div><h2>{kind === "debt" ? "Borç ekle" : "Ödeme al"}</h2><p>{customer.displayName} için ledger kaydı oluşturulacak.</p></div>
        <strong>{formatTRY(customer.currentBalanceCents)}</strong>
      </div>
      <div className="quick-amounts">{[100, 250, 500, 1000].map((value) => <button type="button" key={value} onClick={() => setAmount(String(value))}>{formatTRY(value * 100)}</button>)}</div>
      <div className="form-grid">
        <FormField label="Tutar" inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} />
        {kind === "debt" ? <FormField label="Vade tarihi" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /> : <label className="field"><span className="field__label">Ödeme yöntemi</span><select className="field__input" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}><option value="cash">Nakit</option><option value="card">Kart</option><option value="transfer">Havale/EFT</option></select></label>}
        <FormField label="Açıklama" value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      {mutation.isError ? <p className="form-error">{mutation.error.message}</p> : null}
      <div className="action-row"><Button type="submit" variant="primary" disabled={mutation.isPending}>{kind === "debt" ? "Borcu kaydet" : "Ödemeyi kaydet"}</Button><Button type="button" variant="quiet" onClick={onDone}>İptal</Button></div>
    </form>
  );
}

function VirtualCustomerList({ customers, selectedCustomerId, onSelect }: { customers: CustomerListItemDto[]; selectedCustomerId: string | null; onSelect(customerId: string): void }) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({ count: customers.length, getScrollElement: () => parentRef.current, estimateSize: () => 74, overscan: 8 });
  return <div className="virtual-list" ref={parentRef}><div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>{rowVirtualizer.getVirtualItems().map((virtualRow) => { const customer = customers[virtualRow.index]; return <button key={customer.id} className={selectedCustomerId === customer.id ? "customer-row customer-row--selected" : "customer-row"} style={{ transform: `translateY(${virtualRow.start}px)` }} onClick={() => onSelect(customer.id)}><span><strong>{customer.displayName}</strong><small>{customer.customerCode} · {customer.phone || "Telefon yok"} · {riskLabel(customer.riskStatus)}</small></span><b>{formatTRY(customer.currentBalanceCents)}</b></button>; })}</div></div>;
}

function CustomerHeader({ customer, onEdit }: { customer: CustomerListItemDto; onEdit(): void }) {
  return <header className="customer-header"><div><div className="customer-title-line"><h2>{customer.displayName}</h2><span className="customer-code-chip">{customer.customerCode}</span><RiskChip risk={customer.riskStatus} /></div><p><Phone size={14} /> {customer.phone || "Telefon kaydı yok"} · Son işlem: {formatDateTime(customer.lastLedgerAt)}</p></div><div className="customer-balance"><span>Açık bakiye</span><strong>{formatTRY(customer.currentBalanceCents)}</strong><button onClick={onEdit}><Edit3 size={14} /> Profil</button></div></header>;
}

function CustomerMetrics({ customer }: { customer: CustomerListItemDto }) {
  return (
    <section className="customer-kpi-grid">
      <CustomerKpi icon={<TrendingUp size={17} />} label="Kredi kullanımı" value={customer.creditUsagePercent === null ? "Limit yok" : `%${customer.creditUsagePercent}`} detail={`${formatTRY(customer.creditLimitCents)} limit`} tone={customer.creditUsagePercent !== null && customer.creditUsagePercent >= 90 ? "danger" : "blue"} />
      <CustomerKpi icon={<CalendarClock size={17} />} label="Vade" value={`${customer.paymentTermsDays} gün`} detail={`Son ödeme: ${formatDateTime(customer.lastPaymentAt)}`} tone="blue" />
      <CustomerKpi icon={<AlertTriangle size={17} />} label="Gecikmiş borç" value={formatTRY(customer.overdueDebtCents)} detail={customer.overdueDebtCents > 0 ? "Takip önerilir" : "Gecikme yok"} tone={customer.overdueDebtCents > 0 ? "danger" : "green"} />
      <CustomerKpi icon={<BadgeCheck size={17} />} label="İşlem geçmişi" value={`${customer.debtEntryCount + customer.paymentEntryCount}`} detail={`${customer.debtEntryCount} borç · ${customer.paymentEntryCount} tahsilat`} tone="blue" />
    </section>
  );
}

function CustomerKpi({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: "blue" | "green" | "danger" }) {
  return <article className={`customer-kpi customer-kpi--${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>;
}

function RiskChip({ risk }: { risk: CustomerDto["riskStatus"] }) {
  return <span className={`risk-chip risk-chip--${risk}`}>{risk === "trusted" ? "Güvenilir" : risk === "watch" ? "İzleme" : risk === "blocked" ? "Blokeli" : "Standart"}</span>;
}

function riskLabel(risk: CustomerDto["riskStatus"]) {
  return risk === "trusted" ? "Güvenilir" : risk === "watch" ? "İzleme" : risk === "blocked" ? "Blokeli" : "Standart";
}

function amountInputToCents(value: string): number {
  if (!value.trim()) return 0;
  return parseAmountToCents(value);
}

function centsToInput(value: number): string {
  if (value <= 0) return "";
  return String(value / 100).replace(".", ",");
}

function defaultDueDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

type CustomerFormState = {
  displayName: string;
  phone: string;
  note: string;
  riskStatus: CustomerDto["riskStatus"];
  creditLimit: string;
  paymentTermsDays: string;
};
