import { mealCarbs } from './totals';
import type { Meal, MealGroup } from './types';

/**
 * Agrupacion de comidas (SPEC 25 / D65): **puro**, sin I/O.
 *
 * Un grupo es un contenedor **no destructivo y reversible** que referencia IDs
 * de comidas. No tiene hora ni slot propios ni total almacenado: el total se
 * deriva de las hijas en cada lectura (`groupCarbs`).
 */

/** Id fresco: `crypto.randomUUID()` cuando existe, si no una cadena de respaldo. */
function freshId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Crea un grupo a partir de `mealIds` (>=2), validando que todas existan en
 * `meals` y que compartan una misma fecha. Lanza `Error` en caso contrario.
 * `date` = la fecha comun; `id` por defecto es fresco. El grupo **no** lleva
 * slot ni hora ni total.
 */
export function groupMeals(
  meals: readonly Meal[],
  mealIds: readonly string[],
  name?: string,
  id?: string,
): MealGroup {
  if (mealIds.length < 2) {
    throw new Error('Un grupo necesita al menos 2 comidas');
  }
  if (new Set(mealIds).size !== mealIds.length) {
    throw new Error('Un grupo no admite comidas repetidas');
  }
  const byId = new Map(meals.map((meal) => [meal.id, meal]));
  const children: Meal[] = [];
  for (const mealId of mealIds) {
    const meal = byId.get(mealId);
    if (!meal) throw new Error(`Comida desconocida en el grupo: ${mealId}`);
    children.push(meal);
  }
  const date = children[0]!.date;
  if (children.some((meal) => meal.date !== date)) {
    throw new Error('Todas las comidas de un grupo deben ser del mismo dia');
  }
  const group: MealGroup = { id: id ?? freshId(), date, mealIds: [...mealIds] };
  if (name !== undefined) group.name = name;
  return group;
}

/**
 * Hijas existentes del grupo, en el orden de `group.mealIds`. Solo cuenta comidas
 * de la **misma fecha** que el grupo (defensa ante importaciones manipuladas: una
 * hija de otro dia no debe plegarse aqui ni doble-contar) y deduplica ids
 * repetidos. Lectura tolerante, nunca lanza.
 */
export function groupChildren(group: MealGroup, meals: readonly Meal[]): Meal[] {
  const byId = new Map(
    meals.filter((meal) => meal.date === group.date).map((meal) => [meal.id, meal]),
  );
  const seen = new Set<string>();
  const children: Meal[] = [];
  for (const mealId of group.mealIds) {
    if (seen.has(mealId)) continue;
    seen.add(mealId);
    const meal = byId.get(mealId);
    if (meal) children.push(meal);
  }
  return children;
}

/** Total **derivado** del grupo: suma de `mealCarbs` de sus hijas. Nunca se almacena. */
export function groupCarbs(group: MealGroup, meals: readonly Meal[]): number {
  return groupChildren(group, meals).reduce((sum, meal) => sum + mealCarbs(meal), 0);
}

/** Hora del grupo: la **mas temprana** de sus hijas (HH:MM); '' si no hay hijas. */
export function groupTime(group: MealGroup, meals: readonly Meal[]): string {
  const children = groupChildren(group, meals);
  if (children.length === 0) return '';
  return children.reduce(
    (earliest, meal) => (meal.time < earliest ? meal.time : earliest),
    children[0]!.time,
  );
}

/** Quita el contenedor `groupId` (Separar). Las comidas hijas quedan intactas. */
export function ungroup(groups: readonly MealGroup[], groupId: string): MealGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

/** Cascada (F1f): descarta grupos con menos de 2 hijas existentes del mismo dia. */
export function pruneGroups(groups: readonly MealGroup[], meals: readonly Meal[]): MealGroup[] {
  return groups.filter((group) => groupChildren(group, meals).length >= 2);
}
