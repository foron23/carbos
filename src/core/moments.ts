import type { Meal } from './types';
import { mealCarbs, roundCarbs } from './totals';

export type DayMoment = 'morning' | 'afternoon' | 'evening';

export const MOMENTS: readonly DayMoment[] = ['morning', 'afternoon', 'evening'];

/**
 * Deriva el momento del dia a partir de una hora "HH:MM" (D57).
 * Manana 05:00-11:59, Tarde 12:00-19:59, Noche 20:00-04:59.
 * Inicio inclusivo, fin exclusivo; cualquier hora fuera de rango o
 * no parseable cae en Noche.
 */
export function momentOf(time: string): DayMoment {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return 'evening';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return 'evening';
  const total = hours * 60 + minutes;
  if (total >= 5 * 60 && total < 12 * 60) return 'morning';
  if (total >= 12 * 60 && total < 20 * 60) return 'afternoon';
  return 'evening';
}

/**
 * Suma los carbohidratos redondeados por comida agrupados por momento.
 * Los tres valores suman el total de carbohidratos de las comidas.
 */
export function carbsByMoment(meals: readonly Meal[]): Record<DayMoment, number> {
  const result: Record<DayMoment, number> = { morning: 0, afternoon: 0, evening: 0 };
  for (const meal of meals) {
    result[momentOf(meal.time)] += roundCarbs(mealCarbs(meal));
  }
  return result;
}
