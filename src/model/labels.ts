import { CATALOG, DEFAULT_CLASSMAP, UNKNOWN_CLASS, resolveClass } from '../catalog';
import type { Catalog, ClassMap } from '../catalog';
import { classify } from './classifier';
import type { TopKEntry } from './protocol';

/**
 * Convierte logits del clasificador en entradas top-k con clase resuelta.
 *
 * El modelo devuelve indices; `classes` (del manifest) traduce indice -> etiqueta
 * del mapa de clases (E2), y el mapa resuelve la etiqueta -> id del catalogo.
 */
export function classifyTopK(
  logits: ArrayLike<number>,
  classes: readonly string[],
  k: number,
  map: ClassMap = DEFAULT_CLASSMAP,
  catalog: Catalog = CATALOG,
): TopKEntry[] {
  return classify(logits, k).map((entry) => {
    const raw = classes[entry.index];
    const label = raw ? raw : UNKNOWN_CLASS;
    const resolved = resolveClass(map, label, catalog);
    return { label, classId: resolved ? resolved.food.id : null, p: entry.p };
  });
}
