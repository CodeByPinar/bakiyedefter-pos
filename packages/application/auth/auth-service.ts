import bcrypt from "bcryptjs";
import type { AuditLogRepository } from "@database/repositories/audit-log-repository";
import type { DeviceRepository } from "@database/repositories/device-repository";
import type { UserRepository } from "@database/repositories/user-repository";
import type { AuthenticatedUser } from "@domain/users/user-types";
import type { Permission } from "@shared/permissions";
import { AuthError, PermissionError, ValidationError } from "@shared/errors";

const sessionDurationMs = 30 * 60 * 1000;

export type LoginRoleHint = "owner" | "cashier";
export type AuthState = { setupRequired: true; currentUser: null } | { setupRequired: false; currentUser: AuthenticatedUser | null };

export class AuthService {
  private currentUser: AuthenticatedUser | null = null;
  private expiresAt: number | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly audit: AuditLogRepository,
    private readonly devices: DeviceRepository
  ) {}

  getState(): AuthState {
    if (this.users.countActiveUsers() === 0) return { setupRequired: true, currentUser: null };
    if (this.expiresAt && this.expiresAt <= Date.now()) {
      this.currentUser = null;
      this.expiresAt = null;
    }
    return { setupRequired: false, currentUser: this.currentUser };
  }

  async createFirstOwner(input: { username: string; displayName: string; password: string }): Promise<AuthenticatedUser> {
    if (this.users.countActiveUsers() > 0) throw new AuthError("Owner setup already completed", "İlk kurulum daha önce tamamlanmış.");
    if (input.username.trim().length < 3 || input.displayName.trim().length < 2 || input.password.length < 8) throw new ValidationError("Owner setup fields are invalid");

    const owner = this.users.createOwner({
      username: input.username.trim(),
      displayName: input.displayName.trim(),
      passwordHash: await bcrypt.hash(input.password, 12)
    });

    this.currentUser = owner;
    this.expiresAt = Date.now() + sessionDurationMs;
    this.audit.record({ actorUserId: owner.id, action: "auth.firstOwnerCreated", entityType: "user", entityId: owner.id });
    return owner;
  }

  async login(input: { username: string; password: string; roleHint?: LoginRoleHint; rememberDevice?: boolean; deviceName?: string }): Promise<AuthenticatedUser> {
    const user = this.users.findByUsername(input.username.trim());
    if (!user) throw new AuthError();
    if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) throw new AuthError("User locked", "Çok fazla hatalı deneme yapıldı. Bir süre sonra tekrar deneyin.");

    if (!(await bcrypt.compare(input.password, user.passwordHash))) {
      const failedCount = user.failedLoginCount + 1;
      this.users.markLoginFailed(user.id, failedCount >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null);
      this.audit.record({ actorUserId: user.id, action: "auth.loginFailed", entityType: "user", entityId: user.id, metadata: { failedCount } });
      throw new AuthError();
    }

    if (input.roleHint && !roleMatchesHint(user.role, input.roleHint)) {
      this.audit.record({
        actorUserId: user.id,
        action: "auth.roleMismatch",
        entityType: "user",
        entityId: user.id,
        metadata: { selectedRole: input.roleHint, actualRole: user.role }
      });
      throw new AuthError("Selected role does not match user", "Seçilen rol bu kullanıcıyla eşleşmiyor.");
    }

    this.users.markLoginSucceeded(user.id);
    const authenticated = this.users.findById(user.id);
    if (!authenticated) throw new AuthError("User disappeared after login");

    this.currentUser = authenticated;
    this.expiresAt = Date.now() + sessionDurationMs;

    if (input.rememberDevice && input.deviceName?.trim()) {
      this.devices.remember({ deviceName: input.deviceName.trim().slice(0, 120), actorUserId: authenticated.id });
    }

    this.audit.record({
      actorUserId: authenticated.id,
      action: "auth.loginSucceeded",
      entityType: "user",
      entityId: authenticated.id,
      metadata: { roleHint: input.roleHint ?? null, rememberDevice: Boolean(input.rememberDevice) }
    });
    return authenticated;
  }

  logout(): void {
    if (this.currentUser) this.audit.record({ actorUserId: this.currentUser.id, action: "auth.logout", entityType: "user", entityId: this.currentUser.id });
    this.currentUser = null;
    this.expiresAt = null;
  }

  requireUser(): AuthenticatedUser {
    const state = this.getState();
    if (state.setupRequired || !state.currentUser) throw new AuthError("No active session", "Oturumunuz kapalı. Lütfen tekrar giriş yapın.");
    this.expiresAt = Date.now() + sessionDurationMs;
    return state.currentUser;
  }

  requirePermission(permission: Permission): AuthenticatedUser {
    const user = this.requireUser();
    if (!user.permissions.includes(permission)) throw new PermissionError(permission);
    return user;
  }
}

function roleMatchesHint(role: AuthenticatedUser["role"], hint: LoginRoleHint): boolean {
  if (hint === "owner") return role === "Owner" || role === "Admin";
  return role === "Cashier";
}
