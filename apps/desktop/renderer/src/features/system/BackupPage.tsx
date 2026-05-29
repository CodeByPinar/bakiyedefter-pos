import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup } from "lucide-react";
import { Button } from "@renderer/components/Button";
import { StateBlock } from "@renderer/components/StateBlock";
import { formatDateTime } from "@renderer/lib/format";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";

export function BackupPage() {
  const queryClient = useQueryClient();
  const backups = useQuery({ queryKey: ["backup", "list"], queryFn: () => unwrapIpc(getDesktopApi().backup.list()) });
  const createBackup = useMutation({ mutationFn: () => unwrapIpc(getDesktopApi().backup.create()), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["backup"] }); await queryClient.invalidateQueries({ queryKey: ["system"] }); } });
  return <div className="page-stack"><div className="page-title"><div><h1>Yedekleme</h1><p>SQLite backup API ile doğrulanan manuel yedekler.</p></div><Button variant="primary" icon={<DatabaseBackup size={18} />} onClick={() => createBackup.mutate()} disabled={createBackup.isPending}>Manuel yedek al</Button></div>{createBackup.isError ? <div className="toast toast--error">{createBackup.error.message}</div> : null}{createBackup.isSuccess ? <div className="toast">Yedek doğrulandı: {createBackup.data.path}</div> : null}<section className="panel">{backups.isLoading ? <StateBlock title="Yedek geçmişi yükleniyor" /> : null}{backups.isError ? <StateBlock title="Yedekler alınamadı" body={backups.error.message} /> : null}{backups.data?.length === 0 ? <StateBlock title="Henüz yedek yok" body="Manuel yedek aldığınızda kayıt burada görünecek." /> : null}{backups.data && backups.data.length > 0 ? <div className="ledger-table ledger-table--wide"><div className="ledger-table__head"><span>Durum</span><span>Tip</span><span>Boyut</span><span>Tarih</span><span>Dosya</span></div>{backups.data.map((backup) => <div className="ledger-table__row" key={backup.id}><strong>{backup.status}</strong><span>{backup.backupType}</span><span>{Math.round(backup.sizeBytes / 1024)} KB</span><span>{formatDateTime(backup.createdAt)}</span><span className="path-cell">{backup.path}</span></div>)}</div> : null}</section></div>;
}
