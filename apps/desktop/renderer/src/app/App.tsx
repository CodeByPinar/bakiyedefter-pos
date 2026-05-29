import { useQuery } from "@tanstack/react-query";
import { StateBlock } from "@renderer/components/StateBlock";
import { LoginView } from "@renderer/features/auth/LoginView";
import { OwnerSetupView } from "@renderer/features/auth/OwnerSetupView";
import { DesktopShell } from "@renderer/layouts/DesktopShell";
import { getDesktopApi, hasDesktopBridge, unwrapIpc } from "@renderer/services/desktop-api";

export function App() {
  if (!hasDesktopBridge()) {
    return <main className="bridge-error"><StateBlock title="Desktop bridge bulunamadı" body="Bu arayüz güvenli Electron preload köprüsüyle çalışır. Uygulamayı npm run dev ile Electron içinde açın." /></main>;
  }

  const authState = useQuery({ queryKey: ["auth", "state"], queryFn: () => unwrapIpc(getDesktopApi().auth.getState()) });

  if (authState.isLoading) return <StateBlock title="BakiyeDefter açılıyor" body="Veritabanı ve oturum durumu kontrol ediliyor." />;
  if (authState.isError) return <StateBlock title="Uygulama başlatılamadı" body={authState.error.message} />;
  if (!authState.data) return <StateBlock title="Oturum durumu alınamadı" />;
  if (authState.data.setupRequired) return <OwnerSetupView onReady={() => authState.refetch()} />;
  if (!authState.data.currentUser) return <LoginView onLogin={() => authState.refetch()} />;

  return <DesktopShell user={authState.data.currentUser} onLogout={() => authState.refetch()} />;
}
