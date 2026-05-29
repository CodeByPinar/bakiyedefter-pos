import type Database from "better-sqlite3";
import { createId } from "@domain/shared/ids";

export type PrintJobStatus = "queued" | "printed" | "cancelled" | "failed";

export type PrintJobRecord = {
  id: string;
  jobType: string;
  printerName: string | null;
  status: PrintJobStatus;
  payloadJson: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type PrintJobRow = {
  id: string;
  job_type: string;
  printer_name: string | null;
  status: PrintJobStatus;
  payload_json: string | null;
  error_message: string | null;
  created_at: string;
};

export class PrintJobRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: { jobType: string; printerName?: string | null; status: PrintJobStatus; payload?: Record<string, unknown>; actorUserId?: string | null }): PrintJobRecord {
    const now = new Date().toISOString();
    const id = createId("prn");
    this.db
      .prepare("INSERT INTO print_jobs (id, job_type, printer_name, status, payload_json, error_message, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)")
      .run(id, input.jobType, input.printerName ?? null, input.status, input.payload ? JSON.stringify(input.payload) : null, now, now, input.actorUserId ?? null, input.actorUserId ?? null);
    return this.findById(id)!;
  }

  markStatus(input: { printJobId: string; status: PrintJobStatus; errorMessage?: string | null; actorUserId?: string | null }): void {
    this.db
      .prepare("UPDATE print_jobs SET status = ?, error_message = ?, updated_at = ?, updated_by = ?, version = version + 1 WHERE id = ?")
      .run(input.status, input.errorMessage ?? null, new Date().toISOString(), input.actorUserId ?? null, input.printJobId);
  }

  findById(printJobId: string): PrintJobRecord | null {
    const row = this.db
      .prepare("SELECT id, job_type, printer_name, status, payload_json, error_message, created_at FROM print_jobs WHERE id = ? AND is_deleted = 0")
      .get(printJobId) as PrintJobRow | undefined;
    return row ? mapPrintJob(row) : null;
  }
}

function mapPrintJob(row: PrintJobRow): PrintJobRecord {
  return {
    id: row.id,
    jobType: row.job_type,
    printerName: row.printer_name,
    status: row.status,
    payloadJson: row.payload_json,
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}
