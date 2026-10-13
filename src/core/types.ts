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

export const SCHEMA_VERSION = 3;

export interface Vault {
  version: number;
  meals: Meal[];
  insulin: InsulinLog[];
}

export function emptyVault(): Vault {
  return { version: SCHEMA_VERSION, meals: [], insulin: [] };
}
