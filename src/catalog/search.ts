import { CATALOG } from './catalog';
import type { Catalog, Food } from './types';

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function foodById(id: string, catalog: Catalog = CATALOG): Food | null {
  return catalog.foods.find((food) => food.id === id) ?? null;
}

function score(food: Food, query: string): number {
  const es = normalize(food.name.es);
  const en = normalize(food.name.en);
  if (es === query || en === query) return 100;
  let best = es.startsWith(query) || en.startsWith(query) ? 80 : 0;
  if (best === 0 && (es.includes(query) || en.includes(query))) best = 50;
  for (const synonym of food.synonyms) {
    const syn = normalize(synonym);
    if (syn === query) best = Math.max(best, 90);
    else if (syn.startsWith(query)) best = Math.max(best, 70);
    else if (syn.includes(query)) best = Math.max(best, 40);
  }
  return best;
}

/**
 * Busca alimentos por texto. La relevancia del texto **manda**; a igualdad de
 * relevancia, `usage` (frecuencia derivada del diario, D63) desempata: primero
 * los alimentos mas usados, y luego por nombre. Sin `usage`, el orden es el de
 * siempre.
 */
export function searchFoods(
  query: string,
  limit = 20,
  catalog: Catalog = CATALOG,
  usage?: ReadonlyMap<string, number>,
): Food[] {
  const q = normalize(query);
  if (q.length === 0) return catalog.foods.slice(0, limit);
  return catalog.foods
    .map((food) => ({ food, value: score(food, q) }))
    .filter((entry) => entry.value > 0)
    .sort(
      (a, b) =>
        b.value - a.value ||
        (usage?.get(b.food.id) ?? 0) - (usage?.get(a.food.id) ?? 0) ||
        a.food.name.es.localeCompare(b.food.name.es),
    )
    .slice(0, limit)
    .map((entry) => entry.food);
}
