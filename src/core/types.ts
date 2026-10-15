export type MealOrigin = 'manual' | 'photo';

export interface TopK {
  classId: string;
  p: number;
}

export interface ModelMeta {
  detector: string;
  classifier: string;
  topk: TopK[];
}

export interface FoodItem {
  id: string;
  name: string;
  grams: number;
  carbsPer100g: number;
  classId?: string | undefined;
  // Procedencia del escaneo (spec 17): aditivo, sin bump de esquema.
  barcode?: string | undefined;
  brand?: string | undefined;
}

export interface Meal {
  id: string;
  date: string;
  time: string;
  items: FoodItem[];
  confidence: number | null;
  origin: MealOrigin;
  model?: ModelMeta | undefined;
}

export type InsulinKind = 'bolus' | 'basal';

export interface InsulinLog {
  id: string;
  date: string;
  time: string;
  units: number;
  kind: InsulinKind;
}

/**
 * Contenedor **no destructivo y reversible** de comidas (SPEC 25 / D65).
 * Referencia IDs de comidas (`mealIds`): no copia ni fusiona nada. **No** tiene
 * hora ni slot propios; el total se **deriva** de las hijas y nunca se almacena.
 */
export interface MealGroup {
  id: string;
  date: string;
  name?: string | undefined;
  mealIds: string[];
}

export const SCHEMA_VERSION = 4;

export interface Vault {
  version: number;
  meals: Meal[];
  insulin: InsulinLog[];
  // Opcional: los vault v3 no lo traen; se lee siempre como `(vault.groups ?? [])`.
  groups?: MealGroup[] | undefined;
}

export function emptyVault(): Vault {
  return { version: SCHEMA_VERSION, meals: [], insulin: [], groups: [] };
}
