import type { DashboardPrintDocument } from "@application/printer/printer-service";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function buildDashboardPrintHtml(document: DashboardPrintDocument): string {
  const metrics = document.dashboard;
  const movements = document.recentTransactions
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(formatDate(entry.occurredAt))}</td>
          <td>${escapeHtml(labelFor(entry.eventType))}</td>
          <td>${escapeHtml(entry.customerName)}</td>
          <td>${escapeHtml(entry.description ?? "-")}</td>
          <td class="${entry.direction === "credit" ? "credit" : "debit"}">${formatMoney(entry.amountCents)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(document.documentTitle)}</title>
    <style>
      @page { margin: 14mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111827; font: 12px "Segoe UI", Arial, sans-serif; }
      header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #172033; padding-bottom: 12px; margin-bottom: 18px; }
      h1 { margin: 0 0 4px; font-size: 22px; }
      h2 { margin: 20px 0 8px; font-size: 15px; }
      .muted { color: #667085; }
      .demo { display: inline-block; border: 1px solid #c96f18; border-radius: 999px; color: #9a4f0f; background: #fff1df; padding: 4px 9px; font-weight: 800; }
      .meta { text-align: right; line-height: 1.6; }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
      .stat { border: 1px solid #dfe6ee; border-radius: 8px; padding: 10px; }
      .stat span { display: block; color: #667085; font-size: 11px; font-weight: 700; }
      .stat strong { display: block; margin-top: 4px; font-size: 17px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #dfe6ee; padding: 8px 6px; text-align: left; vertical-align: top; }
      th { background: #f5f7fb; color: #475467; font-size: 10px; text-transform: uppercase; }
      .credit { color: #16804f; font-weight: 800; }
      .debit { color: #c96f18; font-weight: 800; }
      footer { margin-top: 20px; border-top: 1px solid #dfe6ee; padding-top: 10px; color: #667085; font-size: 11px; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>BakiyeDefter POS</h1>
        <div class="muted">Güncel işletme özeti</div>
        <p class="demo">${escapeHtml(document.demoNotice)}</p>
      </div>
      <div class="meta">
        <div><strong>Versiyon:</strong> v1.6.3 Demo</div>
        <div><strong>Hazırlayan:</strong> ${escapeHtml(document.printedBy)}</div>
        <div><strong>Tarih:</strong> ${escapeHtml(formatDate(document.generatedAt))}</div>
        <div><strong>Yazıcı:</strong> ${escapeHtml(document.printerName ?? "Sistem seçimi")}</div>
      </div>
    </header>

    <section class="stats">
      <div class="stat"><span>Toplam Cari</span><strong>${metrics.totalCustomers}</strong></div>
      <div class="stat"><span>Toplam Borç</span><strong>${formatMoney(metrics.totalReceivableCents)}</strong></div>
      <div class="stat"><span>Bugün Tahsilat</span><strong>${formatMoney(metrics.todayPaymentCents)}</strong></div>
      <div class="stat"><span>Bugün Borç Ekleme</span><strong>${formatMoney(metrics.todayDebtCents)}</strong></div>
      <div class="stat"><span>Kasa Bakiyesi</span><strong>${formatMoney(metrics.cashBalanceCents)}</strong></div>
      <div class="stat"><span>Borçlu Cari</span><strong>${metrics.debtorCustomers}</strong></div>
    </section>

    <h2>Son Hesap Hareketleri</h2>
    <table>
      <thead>
        <tr><th>Saat</th><th>İşlem</th><th>Cari</th><th>Açıklama</th><th>Tutar</th></tr>
      </thead>
      <tbody>
        ${movements || `<tr><td colspan="5" class="muted">Henüz hesap hareketi yok.</td></tr>`}
      </tbody>
    </table>

    <footer>
      Bu çıktı BakiyeDefter POS demo sürümünden alınmıştır ve resmi mali belge niteliği taşımaz.
    </footer>
  </body>
</html>`;
}

function formatMoney(amountCents: number): string {
  return money.format(amountCents / 100);
}

function formatDate(value: string): string {
  return dateTime.format(new Date(value));
}

function labelFor(eventType: string): string {
  return { DebtAdded: "Borç Ekle", PaymentReceived: "Tahsilat", TransactionVoided: "İptal", AdjustmentCreated: "Düzeltme", OpeningBalanceCreated: "Açılış" }[eventType] ?? eventType;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
