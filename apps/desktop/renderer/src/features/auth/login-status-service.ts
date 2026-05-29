import type { LoginStatusDto } from "../../../../electron/preload/api-contract";
import { getDesktopApi, unwrapIpc } from "@renderer/services/desktop-api";

export type LoginStatusViewModel = {
  appVersion: string;
  databaseLabel: string;
  databaseReady: boolean;
  backupLabel: string;
  backupReady: boolean;
  offlineLabel: string;
  offlineReady: boolean;
};

export async function getLoginStatus(): Promise<LoginStatusViewModel> {
  const status = await unwrapIpc(getDesktopApi().system.getLoginStatus());
  return mapLoginStatus(status);
}

function mapLoginStatus(status: LoginStatusDto): LoginStatusViewModel {
  return {
    appVersion: status.appVersion,
    databaseLabel: status.databaseReady ? "Veritabanı hazır" : "Veritabanı kontrol edilmeli",
    databaseReady: status.databaseReady,
    backupLabel: status.backupReady ? "Yedekleme aktif" : "Yedek klasörü erişilemiyor",
    backupReady: status.backupReady,
    offlineLabel: status.offlineSupported ? "Offline mod destekleniyor" : "Offline mod pasif",
    offlineReady: status.offlineSupported
  };
}
