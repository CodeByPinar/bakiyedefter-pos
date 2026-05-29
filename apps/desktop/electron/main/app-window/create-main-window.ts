import path from "node:path";
import fs from "node:fs";
import { app, BrowserWindow, screen } from "electron";

export function createMainWindow(): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workArea;
  const window = new BrowserWindow({
    width: Math.min(1180, workArea.width - 24),
    height: Math.min(720, workArea.height - 24),
    center: true,
    minWidth: 980,
    minHeight: 680,
    title: "BakiyeDefter POS",
    icon: resolveWindowIconPath(),
    frame: false,
    backgroundColor: "#f6f8fb",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  window.once("ready-to-show", () => {
    window.center();
    window.show();
  });
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL).catch(console.error);
  else window.loadFile(path.join(__dirname, "../renderer/index.html")).catch(console.error);
  return window;
}

function resolveWindowIconPath(): string | undefined {
  const packagedIconPath = path.join(process.resourcesPath, "icon.ico");
  if (app.isPackaged && fs.existsSync(packagedIconPath)) return packagedIconPath;

  const developmentIconPath = path.resolve(process.cwd(), "build", "icon.ico");
  return fs.existsSync(developmentIconPath) ? developmentIconPath : undefined;
}
