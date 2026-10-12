import { mealSchema, vaultSchema } from './schema';
import type { Meal, Vault } from './types';
import { SCHEMA_VERSION } from './types';

const LEGACY_VERSION = 1;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function upgradeMeal(input: unknown): Meal {
  return mealSchema.parse(input);
}

export function migrateVault(input: unknown): Vault {
  const record = asRecord(input);
  const version = typeof record.version === 'number' ? record.version : Number.NaN;
  if (version === SCHEMA_VERSION) {
    return vaultSchema.parse(input);
  }
  if (version === LEGACY_VERSION) {
    const rawMeals = Array.isArray(record.meals) ? record.meals : [];
    const meals = rawMeals.map((meal) => {
      const item = asRecord(meal);
      return item.origin === undefined ? { ...item, origin: 'manual' } : item;
    });
    return vaultSchema.parse({ ...record, version: SCHEMA_VERSION, meals });
  }
  throw new Error(`Version de esquema no soportada: ${String(record.version)}`);
}
