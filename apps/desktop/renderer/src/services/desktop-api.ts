import type { IpcFailure, IpcResult } from "@shared/result";

export const getDesktopApi = () => window.bakiyeDefter;
export const hasDesktopBridge = () => Boolean(window.bakiyeDefter);

export async function unwrapIpc<T>(request: Promise<IpcResult<T>>): Promise<T> {
  const result = await request;
  if (result.ok) return result.data;
  throw new Error(messageFromFailure(result));
}

function messageFromFailure(result: IpcFailure): string {
  return result.error.message || "İşlem tamamlanamadı.";
}
