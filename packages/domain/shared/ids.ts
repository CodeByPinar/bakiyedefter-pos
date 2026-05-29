import { nanoid } from "nanoid";

export function createId(prefix: string): string {
  return `${prefix}_${nanoid(18)}`;
}

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}_${nanoid(24)}`;
}
