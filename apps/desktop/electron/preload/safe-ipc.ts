import { ipcRenderer } from "electron";
import { ipcChannels, type IpcChannel } from "./api-contract";

const allowedChannels = new Set<string>(ipcChannels);
export function invoke<T>(channel: IpcChannel, payload?: unknown): Promise<T> {
  if (!allowedChannels.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`);
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}
