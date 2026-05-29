import type { AuthService } from "@application/auth/auth-service";
import type { LedgerRepository } from "@database/repositories/ledger-repository";
import { dayBounds } from "@domain/shared/clock";

export class DashboardQuery {
  constructor(private readonly auth: AuthService, private readonly ledger: LedgerRepository) {}

  getDashboard(referenceDate = new Date()) {
    this.auth.requirePermission("Report.View");
    const { startIso, endIso } = dayBounds(referenceDate);
    const thirtyDaysAgo = new Date(referenceDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return this.ledger.getDashboardMetrics(startIso, endIso, thirtyDaysAgo.toISOString());
  }
}
