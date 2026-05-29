import { app, BrowserWindow } from "electron";
import { bootstrapApp } from "./bootstrap/bootstrap-app";
import { createMainWindow } from "./app-window/create-main-window";
import { applyAppSecurityDefaults } from "./security/app-security";

let mainWindow: BrowserWindow | null = null;
let closeDatabase: (() => void) | null = null;
applyAppSecurityDefaults();
app.setName("BakiyeDefter POS");
app.setAppUserModelId("com.bakiyedefter.pos");
app.whenReady().then(() => {
  const bootstrapped = bootstrapApp();
  closeDatabase = bootstrapped.database.close;
  mainWindow = createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  closeDatabase?.();
  mainWindow = null;
});
