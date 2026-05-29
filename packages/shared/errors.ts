export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_ERROR"
  | "PERMISSION_ERROR"
  | "DATABASE_ERROR"
  | "BACKUP_ERROR"
  | "PRINTER_ERROR"
  | "REPORT_ERROR"
  | "SYNC_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNKNOWN";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly userMessage = message,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, "Bilgiler kontrol edilemedi. Lütfen alanları gözden geçirin.", details);
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication failed", userMessage = "Giriş yapılamadı. Bilgileri kontrol edin.") {
    super("AUTH_ERROR", message, userMessage);
  }
}

export class PermissionError extends AppError {
  constructor(permission: string) {
    super("PERMISSION_ERROR", `Missing permission: ${permission}`, "Bu işlem için yetkiniz yok.", { permission });
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("DATABASE_ERROR", message, "İşlem kaydedilemedi. Lütfen tekrar deneyin.", details);
  }
}

export class BackupError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("BACKUP_ERROR", message, "Yedekleme işlemi tamamlanamadı.", details);
  }
}

export class PrinterError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("PRINTER_ERROR", message, "Yazdırma işlemi tamamlanamadı.", details);
  }
}

export function normalizeUnknownError(error: unknown) {
  if (error instanceof AppError) {
    return { ok: false as const, error: { code: error.code, message: error.userMessage, details: error.details } };
  }

  return {
    ok: false as const,
    error: {
      code: "UNKNOWN" as const,
      message: "Beklenmeyen bir hata oluştu.",
      details: { message: error instanceof Error ? error.message : String(error) }
    }
  };
}
