import path from "node:path";
import { createAppDatabase } from "../packages/database/connection";

const databasePath = process.env.BAKIYEDEFTER_DB_PATH ?? path.resolve(process.cwd(), ".data", "bakiyedefter.db");
const database = createAppDatabase(databasePath);
try {
  const result = database.integrityCheck();
  console.log(`Database: ${database.path}`);
  console.log(`Integrity: ${result}`);
  process.exitCode = result === "ok" ? 0 : 1;
} finally {
  database.close();
}
