import type { AuthenticatedUser } from "@domain/users/user-types";
import type { AuditLogRepository } from "@database/repositories/audit-log-repository";
import type { PrintJobRepository, PrintJobStatus } from "@database/repositories/print-job-repository";
import type { AuthService } from "@application/auth/auth-service";
import type { DashboardQuery } from "@application/reports/dashboard-query";
import type { TransactionService } from "@application/transactions/transaction-service";

export type DashboardPrintDocument = {
  jobId: string;
  documentTitle: string;
  generatedAt: string;
  printedBy: string;
  printerName: string | null;
  demoNotice: string;
  dashboard: ReturnType<DashboardQuery["getDashboard"]>;
  recentTransactions: ReturnType<TransactionService["getHistory"]>;
};

export type PreparedPrintDocument = DashboardPrintDocument & {
  actorUserId: string;
};

export class PrinterService {
  constructor(
    private readonly auth: AuthService,
    private readonly dashboard: DashboardQuery,
    private readonly transactions: TransactionService,
    private readonly printJobs: PrintJobRepository,
    private readonly audit: AuditLogRepository
  ) {}

  prepareDashboardPrint(input: { printerName?: string | null }): PreparedPrintDocument {
    const user = this.auth.requirePermission("Report.View");
    const generatedAt = new Date().toISOString();
    const dashboard = this.dashboard.getDashboard();
    const recentTransactions = this.transactions.getHistory(12);
    const documentTitle = "BakiyeDefter POS - Güncel Özet";
    const job = this.printJobs.create({
      jobType: "dashboard-summary",
      printerName: input.printerName ?? null,
      status: "queued",
      payload: { documentTitle, generatedAt, dashboard, recentTransactions },
      actorUserId: user.id
    });

    this.audit.record({ actorUserId: user.id, action: "printer.dashboardQueued", entityType: "printJob", entityId: job.id });

    return {
      jobId: job.id,
      actorUserId: user.id,
      documentTitle,
      generatedAt,
      printedBy: displayName(user),
      printerName: input.printerName ?? null,
      demoNotice: "Demo sürümü çıktısıdır. Mali belge yerine geçmez.",
      dashboard,
      recentTransactions
    };
  }

  completePrintJob(input: { printJobId: string; status: Extract<PrintJobStatus, "printed" | "cancelled">; actorUserId: string; printerName?: string | null }): void {
    this.printJobs.markStatus({ printJobId: input.printJobId, status: input.status, actorUserId: input.actorUserId });
    this.audit.record({ actorUserId: input.actorUserId, action: `printer.${input.status}`, entityType: "printJob", entityId: input.printJobId, metadata: { printerName: input.printerName ?? null } });
  }

  failPrintJob(input: { printJobId: string; actorUserId: string; reason: string; printerName?: string | null }): void {
    this.printJobs.markStatus({ printJobId: input.printJobId, status: "failed", errorMessage: input.reason, actorUserId: input.actorUserId });
    this.audit.record({ actorUserId: input.actorUserId, action: "printer.failed", entityType: "printJob", entityId: input.printJobId, metadata: { printerName: input.printerName ?? null, reason: input.reason } });
  }
}

function displayName(user: AuthenticatedUser): string {
  return user.displayName || user.username;
}
