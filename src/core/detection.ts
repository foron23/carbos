import type { FoodItem } from './types';

/** Entradas de top-k con clase resuelta: las unicas que se pueden elegir. */
export function selectableTopk<T extends { classId: string | null }>(
  topk: readonly T[],
): (T & { classId: string })[] {
  const seen = new Set<string>();
  const result: (T & { classId: string })[] = [];
  for (const entry of topk) {
    if (!entry.classId || seen.has(entry.classId)) continue;
    seen.add(entry.classId);
    result.push(entry as T & { classId: string });
  }
  return result;
}

export interface AlternativeFood {
  id: string;
  name: string;
  carbsPer100g: number;
}

/** Sustituye nombre y carbohidratos por 100 g, conservando la cantidad. */
export function applyAlternative(item: FoodItem, food: AlternativeFood): FoodItem {
  return { ...item, name: food.name, carbsPer100g: food.carbsPer100g, classId: food.id };
}
