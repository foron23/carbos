export interface FoodName {
  es: string;
  en: string;
}

export interface Food {
  id: string;
  name: FoodName;
  synonyms: string[];
  carbsPer100g: number;
  defaultPortionGrams: number;
  source: string;
}

export const CATALOG_VERSION = 1;

export interface Catalog {
  version: number;
  foods: Food[];
}
