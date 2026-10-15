import type { Meal } from './types';

/**
 * Ids de catalogo distintos usados recientemente, del mas nuevo al mas antiguo
 * (D59). Se derivan del diario, no se almacenan (patron D57): recorre las comidas
 * por fecha y hora descendente y devuelve los `classId` sin repetir.
 *
 * - Ignora los items sin `classId` (manuales o escaneados fuera del catalogo).
 * - Sin duplicados: un alimento aparece una sola vez, en su uso mas reciente.
 * - `limit <= 0` devuelve una lista vacia.
 */
/**
 * Cuenta el uso de cada alimento (D63): cuantas veces aparece su `classId` en el
 * diario. Se **deriva**, no se almacena (patron D57). Los items sin `classId`
 * (manuales o escaneados fuera del catalogo) no cuentan.
 */
export function usageCounts(meals: readonly Meal[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const meal of meals) {
    for (const item of meal.items) {
      if (!item.classId) continue;
      counts.set(item.classId, (counts.get(item.classId) ?? 0) + 1);
    }
  }
  return counts;
}

export function recentClassIds(meals: readonly Meal[], limit = 8): string[] {
  if (limit <= 0) return [];
  const sorted = [...meals].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.time !== b.time) return a.time < b.time ? 1 : -1;
    return 0;
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const meal of sorted) {
    for (const item of meal.items) {
      const id = item.classId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
