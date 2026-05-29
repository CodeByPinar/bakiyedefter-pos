import type { AppErrorCode } from "./errors";

export type IpcSuccess<T> = { ok: true; data: T };
export type IpcFailure = {
  ok: false;
  error: { code: AppErrorCode | "UNKNOWN"; message: string; details?: Record<string, unknown> };
};
export type IpcResult<T> = IpcSuccess<T> | IpcFailure;

export function ok<T>(data: T): IpcSuccess<T> {
  return { ok: true, data };
}
