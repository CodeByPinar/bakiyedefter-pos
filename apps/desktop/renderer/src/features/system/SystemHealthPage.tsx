import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Activity, Cable, Database, FolderCheck, HardDrive, ShieldCheck } from "lucide-react";
import { Button } from "@renderer/components/Button";
import { StateBlock } from "@renderer/components/StateBlock";
import { formatDateTime } from "@renderer/lib/format";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";

export function SystemHealthPage() {
  const health = useQuery({ queryKey: ["system", "health"], queryFn: () => unwrapIpc(getDesktopApi().system.getHealth()) });
  const posStatus = useQuery({ queryKey: ["pos", "status", "health"], queryFn: () => unwrapIpc(getDesktopApi().pos.getStatus()) });
  const integrity = useMutation({ mutationFn: () => unwrapIpc(getDesktopApi().system.runIntegrityCheck()), onSuccess: () => health.refetch() });

  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <h1>Sistem Sağlığı</h1>
          <p>Veritabanı, yedek, POS bağlantısı ve disk erişimi kontrolleri.</p>
        </div>
        <Button variant="primary" icon={<Activity size={18} />} onClick={() => integrity.mutate()} disabled={integrity.isPending}>Integrity check</Button>
      </div>

      {health.isLoading ? <StateBlock title="Sistem kontrol ediliyor" /> : null}
      {health.isError ? <StateBlock title="Sistem sağlığı alınamadı" body={health.error.message} /> : null}
      {health.data ? (
        <section className="metric-grid">
          <HealthCard icon={<Database size={20} />} label="Database" value={health.data.databaseStatus === "ok" ? "Sağlıklı" : "Sorunlu"} />
          <HealthCard icon={<ShieldCheck size={20} />} label="Integrity" value={health.data.integrityCheck} />
          <HealthCard icon={<FolderCheck size={20} />} label="Son yedek" value={formatDateTime(health.data.lastBackupAt)} />
          <HealthCard icon={<Cable size={20} />} label="POS bağlantısı" value={posStatus.data?.activeTerminal ? posHealthLabel(posStatus.data.activeTerminal.status) : "Terminal yok"} />
        </section>
      ) : null}

      {health.data ? (
        <section className="panel">
          <div className="summary-list">
            <Detail label="Uygulama sürümü" value={health.data.appVersion} />
            <Detail label="Veritabanı yolu" value={health.data.databasePath} />
            <Detail label="Yedek klasörü erişimi" value={health.data.backupFolderAccessible ? "Erişilebilir" : "Erişilemiyor"} />
            <Detail label="Boş disk alanı" value={health.data.diskAvailableBytes ? `${Math.round(health.data.diskAvailableBytes / 1024 / 1024)} MB` : "Bilinmiyor"} />
            <Detail label="POS sağlayıcı" value={posStatus.data?.provider ?? "Tanımsız"} />
            <Detail label="POS son olay" value={posStatus.data?.latestEvent?.message ?? "Henüz bağlantı denemesi yok"} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function HealthCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <article className="metric-card"><div className="metric-card__icon">{icon}</div><span>{label}</span><strong>{value}</strong></article>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="summary-row"><span>{label}</span><strong>{value}</strong></div>;
}

function posHealthLabel(status: string) {
  if (status === "connected") return "Bağlı";
  if (status === "failed") return "Hatalı";
  if (status === "unsupported") return "Adaptör bekliyor";
  return "Pasif";
}
