import { app, BrowserWindow, shell } from "electron";

export function applyAppSecurityDefaults(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://") || url.startsWith("mailto:")) shell.openExternal(url).catch(() => undefined);
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => {
      if (contents.getURL() && url !== contents.getURL()) event.preventDefault();
    });
    contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  });
  app.on("browser-window-created", (_event, window: BrowserWindow) => {
    window.webContents.on("before-input-event", (event, input) => {
      if (input.control && input.shift && input.key.toLocaleLowerCase("tr-TR") === "i" && app.isPackaged) event.preventDefault();
    });
  });
}
