import type { AuthService } from "@application/auth/auth-service";
import type { AuditLogRepository } from "@database/repositories/audit-log-repository";
import type { CustomerRepository, CustomerSearchParams } from "@database/repositories/customer-repository";

export class CustomerService {
  constructor(private readonly auth: AuthService, private readonly customers: CustomerRepository, private readonly audit: AuditLogRepository) {}

  create(input: { displayName: string; phone?: string | null; note?: string | null; riskStatus?: "standard" | "trusted" | "watch" | "blocked"; creditLimitCents?: number; paymentTermsDays?: number }) {
    const user = this.auth.requirePermission("Customer.Create");
    const customer = this.customers.create({ ...input, actorUserId: user.id });
    this.audit.record({ actorUserId: user.id, action: "customer.created", entityType: "customer", entityId: customer.id });
    return customer;
  }

  update(input: { customerId: string; displayName: string; phone?: string | null; note?: string | null; riskStatus?: "standard" | "trusted" | "watch" | "blocked"; creditLimitCents?: number; paymentTermsDays?: number }) {
    const user = this.auth.requirePermission("Customer.Update");
    const customer = this.customers.update({ ...input, actorUserId: user.id });
    this.audit.record({ actorUserId: user.id, action: "customer.updated", entityType: "customer", entityId: customer.id });
    return customer;
  }

  archive(customerId: string) {
    const user = this.auth.requirePermission("Customer.Archive");
    this.customers.archive(customerId, user.id);
    this.audit.record({ actorUserId: user.id, action: "customer.archived", entityType: "customer", entityId: customerId });
    return { archived: true };
  }

  search(params: CustomerSearchParams) {
    this.auth.requireUser();
    return this.customers.search(params);
  }

  getById(customerId: string) {
    this.auth.requireUser();
    return this.customers.getById(customerId);
  }

  getLedger(customerId: string) {
    this.auth.requireUser();
    return this.customers.getLedger(customerId);
  }
}
