import type { Permission, RoleName } from "@shared/permissions";

export type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  role: RoleName;
  permissions: Permission[];
};
