import { foodItemSchema, mealOriginSchema } from './schema';
import type { FoodItem, MealOrigin } from './types';

/**
 * Borrador persistente (D62): serializacion **pura** del borrador en curso.
 * El I/O de `localStorage` vive en `main.ts` (como favoritos u objetivo): `core/`
 * no toca el navegador. Solo se guarda `{ origin, items }`; la foto y las
 * detecciones no se persisten.
 */
export const DRAFT_KEY = 'carbos.draft';
export const DRAFT_VERSION = 1;

export interface PersistedDraft {
  version: number;
  origin: MealOrigin;
  items: FoodItem[];
}

/** Serializa el borrador con su clave de version. */
export function serializeDraft(origin: MealOrigin, items: readonly FoodItem[]): string {
  const payload: PersistedDraft = { version: DRAFT_VERSION, origin, items: [...items] };
  return JSON.stringify(payload);
}

/**
 * Lee un borrador persistido. Tolerante: `null` si falta, no es JSON, la version
 * no cuadra, el origen es invalido o no queda ningun item valido (se reutiliza el
 * esquema Zod, la unica fuente de "item valido"). Un borrador sin items **no** es
 * un borrador: devuelve `null`.
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
  const parsedOrigin = mealOriginSchema.safeParse(origin);
  if (!parsedOrigin.success) return null;
  if (!Array.isArray(items)) return null;
  const clean: FoodItem[] = [];
  for (const entry of items) {
    const result = foodItemSchema.safeParse(entry);
    if (result.success) clean.push(result.data);
  }
  if (clean.length === 0) return null;
  return { version: DRAFT_VERSION, origin: parsedOrigin.data, items: clean };
}
