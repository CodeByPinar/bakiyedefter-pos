import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { createApplicationServices } from "@application/container";
import { createAppDatabase, type AppDatabase } from "@database/connection";
import { registerIpcRouter } from "@electron/ipc/ipc-router";

export function bootstrapApp(): { database: AppDatabase } {
  const userDataPath = app.getPath("userData");
  const runtimePaths = resolveRuntimePaths(userDataPath);
  const database = createAppDatabase(runtimePaths.databasePath);
  registerIpcRouter(createApplicationServices({ database, userDataPath: runtimePaths.dataRootPath, appVersion: app.getVersion() }));
  return { database };
}

function resolveRuntimePaths(userDataPath: string): { databasePath: string; dataRootPath: string } {
  const explicitDatabasePath = process.env.BAKIYEDEFTER_DB_PATH?.trim();
  if (explicitDatabasePath) {
    const databasePath = path.resolve(explicitDatabasePath);
    return { databasePath, dataRootPath: path.dirname(databasePath) };
  }

  const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR?.trim() || process.env.BAKIYEDEFTER_PORTABLE_DATA_DIR?.trim();
  if (portableRoot) {
    const dataRootPath = path.join(path.resolve(portableRoot), "BakiyeDefter POS Data");
    return { databasePath: path.join(dataRootPath, "bakiyedefter.db"), dataRootPath };
  }

  const sidecarDataRoot = path.join(path.dirname(process.execPath), "BakiyeDefter POS Data");
  if (fs.existsSync(sidecarDataRoot)) {
    return { databasePath: path.join(sidecarDataRoot, "bakiyedefter.db"), dataRootPath: sidecarDataRoot };
  }

  return { databasePath: path.join(userDataPath, "bakiyedefter.db"), dataRootPath: userDataPath };
}
