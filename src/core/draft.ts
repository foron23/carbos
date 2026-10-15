import type { FoodItem, MealOrigin } from './types';

/**
 * Borrador persistente (D62): el borrador en curso sobrevive a la recarga.
 * Es un ajuste de sesion en `localStorage` (como favoritos u objetivo), **sin
 * esquema**. Solo se guarda `{ origin, items }`; la foto y las detecciones no se
 * persisten.
 */
export const DRAFT_KEY = 'carbos.draft';
export const DRAFT_VERSION = 1;

export interface PersistedDraft {
  version: number;
  origin: MealOrigin;
  items: FoodItem[];
}

/** Normaliza un item guardado; `null` si le falta lo esencial. */
function parseItem(value: unknown): FoodItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null;
  if (typeof item.grams !== 'number' || !Number.isFinite(item.grams)) return null;
  if (typeof item.carbsPer100g !== 'number' || !Number.isFinite(item.carbsPer100g)) return null;
  const parsed: FoodItem = {
    id: item.id,
    name: item.name,
    grams: item.grams,
    carbsPer100g: item.carbsPer100g,
  };
  if (typeof item.classId === 'string') parsed.classId = item.classId;
  if (typeof item.barcode === 'string') parsed.barcode = item.barcode;
  if (typeof item.brand === 'string') parsed.brand = item.brand;
  return parsed;
}

/** Serializa el borrador con su clave de version. */
export function serializeDraft(origin: MealOrigin, items: readonly FoodItem[]): string {
  const payload: PersistedDraft = { version: DRAFT_VERSION, origin, items: [...items] };
  return JSON.stringify(payload);
}

/**
 * Lee un borrador persistido. Tolerante: `null` si falta, no es JSON, la version
 * no cuadra, el origen es invalido o no queda ningun item valido. Un borrador sin
 * items **no** es un borrador: devuelve `null`.
 */
export function parseDraft(raw: string | null | undefined): PersistedDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { version, origin, items } = parsed as Record<string, unknown>;
  if (version !== DRAFT_VERSION) return null;
  if (origin !== 'manual' && origin !== 'photo') return null;
  if (!Array.isArray(items)) return null;
  const clean = items.map(parseItem).filter((item): item is FoodItem => item !== null);
  if (clean.length === 0) return null;
  return { version: DRAFT_VERSION, origin, items: clean };
}

/** Guarda el borrador; un borrador vacio lo limpia. */
export function saveDraft(origin: MealOrigin, items: readonly FoodItem[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    localStorage.setItem(DRAFT_KEY, serializeDraft(origin, items));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Recupera el borrador persistido (o `null`). */
export function loadDraft(): PersistedDraft | null {
  try {
    return parseDraft(localStorage.getItem(DRAFT_KEY));
  } catch {
    return null;
  }
}

/** Descarta el borrador persistido. */
export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}
