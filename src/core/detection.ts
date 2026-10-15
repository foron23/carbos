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

/**
 * Cuenta cuantas detecciones resuelven a una clase del catalogo (`classId`
 * verdadero) y cuantas quedan sin clase resuelta. Permite hablar con honestidad
 * de lo que la foto ha reconocido: una caja sin clase no es un alimento.
 */
export function summarizeDetections<T extends { classId: string | null }>(
  results: readonly T[],
): { resolved: number; unknown: number } {
  let resolved = 0;
  let unknown = 0;
  for (const entry of results) {
    if (entry.classId) resolved += 1;
    else unknown += 1;
  }
  return { resolved, unknown };
}

export interface DetectionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RawDetection {
  classId: string | null;
  score: number;
  box: DetectionBox;
}

/**
 * Une las detecciones que resuelven a la misma clase del catalogo, quedandose
 * con la de mayor confianza. El detector generico (COCO) suele emitir varias
 * cajas para un mismo alimento; sin esto cada caja se convierte en un item
 * repetido. Las detecciones sin clase resuelta se conservan (el panel las
 * muestra como "desconocido") pero no generan alimento. El resultado va
 * ordenado por confianza descendente.
 */
export function mergeDetections<T extends RawDetection>(results: readonly T[]): T[] {
  const best = new Map<string, T>();
  const unresolved: T[] = [];
  for (const result of results) {
    if (!result.classId) {
      unresolved.push(result);
      continue;
    }
    const previous = best.get(result.classId);
    if (!previous || result.score > previous.score) best.set(result.classId, result);
  }
  return [...best.values(), ...unresolved].sort((a, b) => b.score - a.score);
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
