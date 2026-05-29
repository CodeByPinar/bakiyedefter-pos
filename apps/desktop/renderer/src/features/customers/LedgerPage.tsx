import { useQuery } from "@tanstack/react-query";
import { MoneyDelta } from "@renderer/components/MoneyDelta";
import { StateBlock } from "@renderer/components/StateBlock";
import { formatDateTime, ledgerLabel } from "@renderer/lib/format";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";

export function LedgerPage() {
  const history = useQuery({ queryKey: ["transactions", "history", 100], queryFn: () => unwrapIpc(getDesktopApi().transactions.getHistory({ limit: 100 })) });
  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <h1>Hareketler</h1>
          <p>Finansal kayıtlar değiştirilmeyen ledger hareketleri olarak tutulur.</p>
        </div>
      </div>
      <section className="panel">
        {history.isLoading ? <StateBlock title="Hareketler yükleniyor" /> : null}
        {history.isError ? <StateBlock title="Hareketler alınamadı" body={history.error.message} /> : null}
        {history.data?.length === 0 ? <StateBlock title="Henüz hareket yok" body="İlk borç veya ödeme işleminden sonra liste oluşur." /> : null}
        {history.data && history.data.length > 0 ? (
          <div className="ledger-table ledger-table--wide">
            <div className="ledger-table__head"><span>İşlem</span><span>Cari</span><span>Açıklama</span><span>Tutar</span><span>Tarih</span></div>
            {history.data.map((entry) => <div className="ledger-table__row" key={entry.id}><span>{ledgerLabel(entry.eventType)}</span><strong>{entry.customerName}</strong><span>{entry.description || "-"}</span><MoneyDelta amountCents={entry.amountCents} direction={entry.direction} /><span>{formatDateTime(entry.occurredAt)}</span></div>)}
          </div>
        ) : null}
      </section>
    </div>
  );
}
