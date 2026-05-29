import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "apps/desktop/electron/main/main.ts"),
        formats: ["cjs"]
      }
    },
    resolve: {
      alias: {
        "@application": resolve(__dirname, "packages/application"),
        "@database": resolve(__dirname, "packages/database"),
        "@domain": resolve(__dirname, "packages/domain"),
        "@shared": resolve(__dirname, "packages/shared"),
        "@audit": resolve(__dirname, "packages/audit"),
        "@backup": resolve(__dirname, "packages/backup"),
        "@reports": resolve(__dirname, "packages/reports"),
        "@security": resolve(__dirname, "packages/security"),
        "@infrastructure": resolve(__dirname, "packages/infrastructure"),
        "@electron": resolve(__dirname, "apps/desktop/electron")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "apps/desktop/electron/preload/index.ts"),
        formats: ["cjs"]
      }
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "packages/shared")
      }
    }
  },
  renderer: {
    root: resolve(__dirname, "apps/desktop/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "apps/desktop/renderer/index.html")
      }
    },
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "apps/desktop/renderer/src"),
        "@shared": resolve(__dirname, "packages/shared")
      }
    }
  }
});
