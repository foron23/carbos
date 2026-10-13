import { mealSchema, vaultSchema } from './schema';
import type { Meal, Vault } from './types';
import { SCHEMA_VERSION } from './types';

const TIME_RE = /^\d{2}:\d{2}$/;

const SLOT_TIMES: Record<string, string> = {
  breakfast: '08:00',
  lunch: '14:00',
  dinner: '21:00',
  snack: '17:00',
};

export function slotToTime(slot: unknown): string {
  const known = typeof slot === 'string' && Object.prototype.hasOwnProperty.call(SLOT_TIMES, slot);
  return known ? SLOT_TIMES[slot as string]! : '12:00';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function upgradeMeal(input: unknown): Meal {
  const item = asRecord(input);
  const time =
    typeof item.time === 'string' && TIME_RE.test(item.time) ? item.time : slotToTime(item.slot);
  const origin = item.origin ?? 'manual';
  return mealSchema.parse({ ...item, time, origin });
}

export function migrateVault(input: unknown): Vault {
  const record = asRecord(input);
  const version = typeof record.version === 'number' ? record.version : Number.NaN;
  if (version === 1 || version === 2 || version === SCHEMA_VERSION) {
    const rawMeals = Array.isArray(record.meals) ? record.meals : [];
    const meals = rawMeals.map(upgradeMeal);
    return vaultSchema.parse({ ...record, version: SCHEMA_VERSION, meals });
  }
  throw new Error(`Version de esquema no soportada: ${String(record.version)}`);
}
