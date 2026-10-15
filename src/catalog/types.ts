export interface FoodName {
  es: string;
  en: string;
}

export interface Food {
  id: string;
  name: FoodName;
  synonyms: string[];
  carbsPer100g: number;
  carbsRange?: [number, number];
  // Macros y energia opcionales (SPEC 26 / D68): si la fuente no trae el dato se
  // omite; kcalDerived marca la energia calculada 4p+4c+9f (nunca inventa fibra).
  proteinPer100g?: number;
  fatPer100g?: number;
  kcalPer100g?: number;
  kcalDerived?: boolean;
  fiberPer100g?: number;
  sugarsPer100g?: number;
  defaultPortionGrams: number;
  source: string;
}

export const CATALOG_VERSION = 2;

export interface Catalog {
  version: number;
  foods: Food[];
}
