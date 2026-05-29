import type { AuthService } from "@application/auth/auth-service";
import type { SettingsRepository } from "@database/repositories/settings-repository";

export class SettingsService {
  constructor(private readonly auth: AuthService, private readonly settings: SettingsRepository) {}
  getAll() {
    this.auth.requireUser();
    return this.settings.getAll();
  }
  update(input: Record<string, string | number | boolean>) {
    const user = this.auth.requirePermission("Settings.Manage");
    return this.settings.update(input, user.id);
  }
}
