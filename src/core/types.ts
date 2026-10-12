export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodItem {
  id: string;
  name: string;
  grams: number;
  carbsPer100g: number;
}

export interface Meal {
  id: string;
  date: string;
  slot: MealSlot;
  items: FoodItem[];
  confidence: number | null;
}

export type InsulinKind = 'bolus' | 'basal';

export interface InsulinLog {
  id: string;
  date: string;
  time: string;
  units: number;
  kind: InsulinKind;
}

export const SCHEMA_VERSION = 1;

export interface Vault {
  version: number;
  meals: Meal[];
  insulin: InsulinLog[];
}

export function emptyVault(): Vault {
  return { version: SCHEMA_VERSION, meals: [], insulin: [] };
}
