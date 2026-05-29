export const permissions = [
  "Customer.Create",
  "Customer.Update",
  "Customer.Archive",
  "Transaction.AddDebt",
  "Transaction.ReceivePayment",
  "Transaction.Void",
  "Transaction.Undo",
  "Report.View",
  "Report.Export",
  "Backup.Create",
  "Backup.Restore",
  "User.Manage",
  "Settings.Manage"
] as const;

export type Permission = (typeof permissions)[number];
export const roles = ["Owner", "Admin", "Cashier", "ReadOnly", "Accountant"] as const;
export type RoleName = (typeof roles)[number];

export const rolePermissionMap: Record<RoleName, Permission[]> = {
  Owner: [...permissions],
  Admin: permissions.filter((permission) => permission !== "Backup.Restore"),
  Cashier: ["Customer.Create", "Customer.Update", "Transaction.AddDebt", "Transaction.ReceivePayment", "Transaction.Undo", "Report.View", "Backup.Create"],
  ReadOnly: ["Report.View"],
  Accountant: ["Customer.Create", "Customer.Update", "Transaction.AddDebt", "Transaction.ReceivePayment", "Transaction.Void", "Transaction.Undo", "Report.View", "Report.Export"]
};
