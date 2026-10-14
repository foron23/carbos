import type { FoodItem, Meal } from './types';

export function itemCarbs(item: FoodItem): number {
  return (item.grams * item.carbsPer100g) / 100;
}

export function mealCarbs(meal: Meal): number {
  return meal.items.reduce((sum, item) => sum + itemCarbs(item), 0);
}

export function mealsForDate(meals: readonly Meal[], date: string): Meal[] {
  return meals.filter((meal) => meal.date === date);
}

export function dayCarbs(meals: readonly Meal[], date: string): number {
  return mealsForDate(meals, date).reduce((sum, meal) => sum + mealCarbs(meal), 0);
}

export function weekCarbs(meals: readonly Meal[], startDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return meals
    .filter((meal) => {
      const t = Date.parse(`${meal.date}T00:00:00Z`);
      return t >= start && t < end;
    })
    .reduce((sum, meal) => sum + mealCarbs(meal), 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lunes de la semana ISO que contiene `date`, en UTC (YYYY-MM-DD). */
export function startOfWeek(date: string): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  const weekday = new Date(time).getUTCDay();
  const delta = (weekday + 6) % 7;
  return new Date(time - delta * DAY_MS).toISOString().slice(0, 10);
}

export interface WeekDay {
  date: string;
  carbs: number;
  active: boolean;
}

export function weekBreakdown(meals: readonly Meal[], activeDate: string): WeekDay[] {
  const start = Date.parse(`${startOfWeek(activeDate)}T00:00:00Z`);
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    days.push({ date, carbs: dayCarbs(meals, date), active: date === activeDate });
  }
  return days;
}

export function roundCarbs(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface TargetProgress {
  target: number;
  consumed: number;
  remaining: number;
  ratio: number;
  over: boolean;
}

/**
 * Progreso del objetivo diario (D60). Presentacional y sin juicio: `remaining`
 * nunca es negativo (lo que "queda") y `ratio` se acota a `[0, 1]` para la barra.
 * Un `target` no positivo equivale a "sin objetivo".
 */
export function targetProgress(consumed: number, target: number): TargetProgress {
  const safeTarget = target > 0 ? target : 0;
  const remaining = Math.max(0, safeTarget - consumed);
  const ratio = safeTarget > 0 ? Math.min(1, Math.max(0, consumed / safeTarget)) : 0;
  return {
    target: safeTarget,
    consumed,
    remaining,
    ratio,
    over: safeTarget > 0 && consumed > safeTarget,
  };
}
