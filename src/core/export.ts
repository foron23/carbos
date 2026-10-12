import { migrateVault } from './migrate';
import type { Vault } from './types';

export function toJson(vault: Vault): string {
  return JSON.stringify(vault, null, 2);
}

export function fromJson(text: string): Vault {
  return migrateVault(JSON.parse(text));
}
