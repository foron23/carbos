import { mealGroupSchema, mealSchema, vaultSchema } from './schema';
import type { Meal, MealGroup, Vault } from './types';
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

/**
 * Lectura tolerante de grupos (como el borrador D62): se conservan solo las
 * entradas que parsean via `mealGroupSchema`, se deduplican los ids de hija y se
 * descartan los grupos que quedan con menos de 2 hijas (un contenedor asi no
 * aporta nada y `pruneGroups` lo desharia igual). Siempre devuelve un array.
 */
export function normalizeGroups(input: unknown): MealGroup[] {
  if (!Array.isArray(input)) return [];
  const groups: MealGroup[] = [];
  for (const entry of input) {
    const parsed = mealGroupSchema.safeParse(entry);
    if (!parsed.success) continue;
    const mealIds = [...new Set(parsed.data.mealIds)];
    if (mealIds.length < 2) continue;
    groups.push({ ...parsed.data, mealIds });
  }
  return groups;
}

export function migrateVault(input: unknown): Vault {
  const record = asRecord(input);
  const version = typeof record.version === 'number' ? record.version : Number.NaN;
  // Acepta explicitamente 1 | 2 | 3 | 4 | 5. Los vault v3 (sin grupos) y v4
  // (grupos ya presentes, SPEC 25) de instalaciones existentes suben a 5; los
  // items sin los macros de SPEC 26 quedan con esos campos `undefined`.
  if (
    version === 1 ||
    version === 2 ||
    version === 3 ||
    version === 4 ||
    version === SCHEMA_VERSION
  ) {
    const rawMeals = Array.isArray(record.meals) ? record.meals : [];
    const meals = rawMeals.map(upgradeMeal);
    const groups = normalizeGroups(record.groups);
    return vaultSchema.parse({ ...record, version: SCHEMA_VERSION, meals, groups });
  }
  throw new Error(`Version de esquema no soportada: ${String(record.version)}`);
}
