import { normalizeForSearch } from "@domain/shared/normalize";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function buildCustomerCode(input: { displayName: string; createdAt: Date; sequence: number }): string {
  const day = pad2(input.createdAt.getDate());
  const month = pad2(input.createdAt.getMonth() + 1);
  const namePart = customerNamePart(input.displayName);
  const sequencePart = toBase36(input.sequence, 2);
  const body = `CR${day}${month}-${namePart}${sequencePart}`;
  return `${body}K${checksum(body)}`;
}

export function customerCodeDatePrefix(createdAt: Date): string {
  return `CR${pad2(createdAt.getDate())}${pad2(createdAt.getMonth() + 1)}-`;
}

function customerNamePart(displayName: string): string {
  const normalized = normalizeForSearch(displayName).toUpperCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`;
  const compact = (words[0] ?? "CR").replace(/[^A-Z0-9]/g, "");
  return `${compact}XX`.slice(0, 2);
}

function checksum(value: string): string {
  let total = 0;
  for (const char of value) total = (total + char.charCodeAt(0) * 17) % 1296;
  return toBase36(total, 2);
}

function toBase36(value: number, width: number): string {
  let current = Math.max(0, value);
  let output = "";
  do {
    output = alphabet[current % alphabet.length] + output;
    current = Math.floor(current / alphabet.length);
  } while (current > 0);
  return output.padStart(width, "0").slice(-width);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
