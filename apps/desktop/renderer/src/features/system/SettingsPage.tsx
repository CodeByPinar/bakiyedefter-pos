import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, Save, Server } from "lucide-react";
import { Button } from "@renderer/components/Button";
import { FormField } from "@renderer/components/FormField";
import { StateBlock } from "@renderer/components/StateBlock";
import { formatDateTime } from "@renderer/lib/format";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";
import type { PosConnectionTypeDto, PosTerminalDto } from "../../../../electron/preload/api-contract";

type SettingsFormState = {
  businessName: string;
  businessPhone: string;
  backupHour: string;
  posIntegrationEnabled: boolean;
  posProvider: string;
  posConnectionMode: PosConnectionTypeDto;
  posTimeoutSeconds: string;
  terminalId?: string;
  terminalCode: string;
  terminalName: string;
  endpoint: string;
  port: string;
  pairingKey: string;
};

const defaultForm: SettingsFormState = {
  businessName: "",
  businessPhone: "",
  backupHour: "21:00",
  posIntegrationEnabled: false,
  posProvider: "local-terminal",
  posConnectionMode: "manual",
  posTimeoutSeconds: "10",
  terminalCode: "",
  terminalName: "Merkez POS Terminali",
  endpoint: "",
  port: "",
  pairingKey: ""
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => unwrapIpc(getDesktopApi().settings.get()) });
  const posStatus = useQuery({ queryKey: ["pos", "status"], queryFn: () => unwrapIpc(getDesktopApi().pos.getStatus()) });
  const terminals = useQuery({ queryKey: ["pos", "terminals"], queryFn: () => unwrapIpc(getDesktopApi().pos.listTerminals()) });
  const [form, setForm] = useState<SettingsFormState>(defaultForm);

  useEffect(() => {
    if (!settings.data) return;
    const terminal = terminals.data?.[0];
    setForm((current) => ({
      ...current,
      businessName: String(settings.data.businessName ?? ""),
      businessPhone: String(settings.data.businessPhone ?? ""),
      backupHour: String(settings.data.autoBackupHour ?? "21:00"),
      posIntegrationEnabled: settings.data.posIntegrationEnabled === true,
      posProvider: String(settings.data.posProvider ?? terminal?.provider ?? "local-terminal"),
      posConnectionMode: connectionModeFrom(settings.data.posConnectionMode, terminal),
      posTimeoutSeconds: String(settings.data.posTimeoutSeconds ?? "10"),
      terminalId: terminal?.id,
      terminalCode: terminal?.terminalCode ?? current.terminalCode,
      terminalName: terminal?.displayName ?? current.terminalName,
      endpoint: terminal?.endpoint ?? current.endpoint,
      port: terminal?.port ? String(terminal.port) : current.port,
      pairingKey: terminal?.pairingKey ?? current.pairingKey
    }));
  }, [settings.data, terminals.data]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const provider = form.posProvider.trim() || "local-terminal";
      await unwrapIpc(
        getDesktopApi().settings.update({
          businessName: form.businessName,
          businessPhone: form.businessPhone,
          autoBackupHour: form.backupHour,
          posIntegrationEnabled: form.posIntegrationEnabled,
          posProvider: provider,
          posConnectionMode: form.posConnectionMode,
          posTimeoutSeconds: Number(form.posTimeoutSeconds || 10)
        })
      );

      return unwrapIpc(
        getDesktopApi().pos.saveTerminal({
          id: form.terminalId,
          terminalCode: form.terminalCode || undefined,
          displayName: form.terminalName,
          provider,
          connectionType: form.posConnectionMode,
          endpoint: form.endpoint || null,
          port: form.port ? Number(form.port) : null,
          pairingKey: form.pairingKey || null
        })
      );
    },
    onSuccess: async (terminal) => {
      setForm((current) => ({ ...current, terminalId: terminal.id, terminalCode: terminal.terminalCode }));
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      await queryClient.invalidateQueries({ queryKey: ["pos"] });
      await queryClient.invalidateQueries({ queryKey: ["system"] });
    }
  });

  const testConnection = useMutation({
    mutationFn: () => {
      if (!form.terminalId) throw new Error("Önce POS terminal ayarlarını kaydedin.");
      return unwrapIpc(getDesktopApi().pos.testConnection({ terminalId: form.terminalId }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pos"] });
      await queryClient.invalidateQueries({ queryKey: ["system"] });
    }
  });

  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <h1>Ayarlar</h1>
          <p>İşletme bilgileri, yedekleme ve POS bağlantı ayarları.</p>
        </div>
      </div>

      {settings.isLoading ? <StateBlock title="Ayarlar yükleniyor" /> : null}
      {settings.isError ? <StateBlock title="Ayarlar alınamadı" body={settings.error.message} /> : null}

      {settings.data ? (
        <form className="panel settings-form settings-form--wide" onSubmit={(event) => { event.preventDefault(); saveSettings.mutate(); }}>
          <section className="settings-section">
            <header>
              <h2>İşletme ve yedekleme</h2>
              <p>Bu alanlar migration seed ayarlarından gelir, demo veri değildir.</p>
            </header>
            <div className="form-grid">
              <FormField label="İşletme adı" value={form.businessName} onChange={(event) => updateForm({ businessName: event.target.value })} />
              <FormField label="İşletme telefonu" value={form.businessPhone} onChange={(event) => updateForm({ businessPhone: event.target.value })} />
              <FormField label="Otomatik yedek saati" value={form.backupHour} onChange={(event) => updateForm({ backupHour: event.target.value })} />
            </div>
          </section>

          <section className="settings-section pos-settings-card">
            <header>
              <div>
                <h2>POS bağlantısı</h2>
                <p>Terminal kaydı yerel veritabanında tutulur. TCP seçilirse gerçek bağlantı testi yapılır.</p>
              </div>
              <span className={`type-chip type-chip--${posStatus.data?.activeTerminal?.status === "connected" ? "credit" : posStatus.data?.activeTerminal?.status === "failed" ? "neutral" : "debit"}`}>
                {posStatus.data?.activeTerminal ? posStatusLabel(posStatus.data.activeTerminal.status) : "Terminal yok"}
              </span>
            </header>

            <label className="settings-toggle">
              <input type="checkbox" checked={form.posIntegrationEnabled} onChange={(event) => updateForm({ posIntegrationEnabled: event.target.checked })} />
              <span>POS entegrasyonu aktif</span>
            </label>

            <div className="form-grid">
              <FormField label="Terminal kodu" placeholder="Boş bırakılırsa otomatik üretilir" value={form.terminalCode} onChange={(event) => updateForm({ terminalCode: event.target.value.toUpperCase() })} />
              <FormField label="Terminal adı" value={form.terminalName} onChange={(event) => updateForm({ terminalName: event.target.value })} />
              <FormField label="Sağlayıcı" value={form.posProvider} onChange={(event) => updateForm({ posProvider: event.target.value })} />
              <label className="field">
                <span className="field__label">Bağlantı tipi</span>
                <select className="field__input" value={form.posConnectionMode} onChange={(event) => updateForm({ posConnectionMode: event.target.value as PosConnectionTypeDto })}>
                  <option value="manual">Manuel / harici POS</option>
                  <option value="tcp">TCP/IP terminal</option>
                  <option value="serial">Seri port</option>
                  <option value="usb">USB</option>
                </select>
              </label>
              <FormField label="Endpoint / IP" value={form.endpoint} onChange={(event) => updateForm({ endpoint: event.target.value })} disabled={form.posConnectionMode !== "tcp"} />
              <FormField label="Port" inputMode="numeric" value={form.port} onChange={(event) => updateForm({ port: event.target.value })} disabled={form.posConnectionMode !== "tcp"} />
              <FormField label="Pairing anahtarı" value={form.pairingKey} onChange={(event) => updateForm({ pairingKey: event.target.value })} />
              <FormField label="Zaman aşımı (sn)" inputMode="numeric" value={form.posTimeoutSeconds} onChange={(event) => updateForm({ posTimeoutSeconds: event.target.value })} />
            </div>

            <div className="pos-status-summary">
              <Server size={18} />
              <span>{posStatus.data?.terminalCount ?? 0} terminal kayıtlı</span>
              <span>Son bağlantı: {formatDateTime(posStatus.data?.activeTerminal?.lastConnectedAt ?? null)}</span>
              <span>Son olay: {posStatus.data?.latestEvent?.message ?? "Henüz bağlantı denemesi yok"}</span>
            </div>
          </section>

          {saveSettings.isError ? <p className="form-error">{saveSettings.error.message}</p> : null}
          {testConnection.isError ? <p className="form-error">{testConnection.error.message}</p> : null}
          {saveSettings.isSuccess ? <p className="form-success">Ayarlar ve POS terminal kaydı kaydedildi.</p> : null}
          {testConnection.data ? <p className={testConnection.data.connected ? "form-success" : "form-error"}>{testConnection.data.message}</p> : null}

          <div className="action-row">
            <Button type="submit" variant="primary" icon={<Save size={18} />} disabled={saveSettings.isPending}>Kaydet</Button>
            <Button type="button" icon={<Cable size={18} />} onClick={() => testConnection.mutate()} disabled={testConnection.isPending || saveSettings.isPending}>
              Bağlantıyı test et
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );

  function updateForm(patch: Partial<SettingsFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }
}

function connectionModeFrom(value: unknown, terminal?: PosTerminalDto): PosConnectionTypeDto {
  if (value === "tcp" || value === "serial" || value === "usb" || value === "manual") return value;
  return terminal?.connectionType ?? "manual";
}

function posStatusLabel(status: PosTerminalDto["status"]) {
  if (status === "connected") return "Bağlı";
  if (status === "failed") return "Bağlantı hatası";
  if (status === "unsupported") return "Adaptör bekliyor";
  return "Pasif";
}
