import { vaultSchema } from './schema';
import type { Vault } from './types';

export function toJson(vault: Vault): string {
  return JSON.stringify(vault, null, 2);
}

export function fromJson(text: string): Vault {
  const parsed: unknown = JSON.parse(text);
  return vaultSchema.parse(parsed);
}
