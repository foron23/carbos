import type { FoodItem, Meal } from './types';

export function itemCarbs(item: FoodItem): number {
  return (item.grams * item.carbsPer100g) / 100;
}

export function mealCarbs(meal: Meal): number {
  return meal.items.reduce((sum, item) => sum + itemCarbs(item), 0);
}

/** Desglose de composicion (SPEC 26 / D68). Todo campo es opcional: lo ausente no se pinta. */
export interface Macros {
  protein?: number | undefined;
  fat?: number | undefined;
  kcal?: number | undefined;
  kcalDerived?: boolean | undefined;
  fiber?: number | undefined;
  sugars?: number | undefined;
}

/** Factores de Atwater para derivar kcal de proteina/carbohidratos/grasa (SPEC 26). */
export const KCAL_FACTORS = { protein: 4, carbs: 4, fat: 9 } as const;

function scale(grams: number, per100g: number | undefined): number | undefined {
  return per100g === undefined ? undefined : (grams * per100g) / 100;
}

/**
 * Macros de un item escalados por gramos (`grams * per100g / 100`). `protein`,
 * `fat`, `fiber` y `sugars` solo si el campo del item esta definido. `kcal` usa
 * la fuente si existe; si no, y hay protein+a grasa, la deriva `4p + 4c + 9f` y
 * la marca (`kcalDerived: true`); si falta protein o grasa, omite kcal.
 */
export function itemMacros(item: FoodItem): Macros {
  const macros: Macros = {};
  const protein = scale(item.grams, item.proteinPer100g);
  const fat = scale(item.grams, item.fatPer100g);
  const fiber = scale(item.grams, item.fiberPer100g);
  const sugars = scale(item.grams, item.sugarsPer100g);
  if (protein !== undefined) macros.protein = protein;
  if (fat !== undefined) macros.fat = fat;
  if (fiber !== undefined) macros.fiber = fiber;
  if (sugars !== undefined) macros.sugars = sugars;

  if (item.kcalPer100g !== undefined) {
    macros.kcal = scale(item.grams, item.kcalPer100g);
    macros.kcalDerived = item.kcalDerived ?? false;
  } else if (item.proteinPer100g !== undefined && item.fatPer100g !== undefined) {
    const derivedPer100g =
      KCAL_FACTORS.protein * item.proteinPer100g +
      KCAL_FACTORS.carbs * item.carbsPer100g +
      KCAL_FACTORS.fat * item.fatPer100g;
    macros.kcal = scale(item.grams, derivedPer100g);
    macros.kcalDerived = true;
  }
  return macros;
}

function sumDefined(values: readonly (number | undefined)[]): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length > 0 ? defined.reduce((sum, value) => sum + value, 0) : undefined;
}

/**
 * Agrega un desglose por comida o dia: suma cada nutriente definido y lo deja
 * `undefined` si ningun contribuyente lo trae. `kcalDerived` es `true` si hay
 * kcal y al menos un contribuyente derivado, `false` si hay kcal y ninguno lo
 * es, y `undefined` si no hay kcal.
 */
function aggregateMacros(parts: readonly Macros[]): Macros {
  const macros: Macros = {};
  const protein = sumDefined(parts.map((part) => part.protein));
  const fat = sumDefined(parts.map((part) => part.fat));
  const fiber = sumDefined(parts.map((part) => part.fiber));
  const sugars = sumDefined(parts.map((part) => part.sugars));
  const kcal = sumDefined(parts.map((part) => part.kcal));
  if (protein !== undefined) macros.protein = protein;
  if (fat !== undefined) macros.fat = fat;
  if (fiber !== undefined) macros.fiber = fiber;
  if (sugars !== undefined) macros.sugars = sugars;
  if (kcal !== undefined) {
    macros.kcal = kcal;
    macros.kcalDerived = parts.some((part) => part.kcal !== undefined && part.kcalDerived === true);
  }
  return macros;
}

export function mealMacros(meal: Meal): Macros {
  return aggregateMacros(meal.items.map(itemMacros));
}

export function dayMacros(meals: readonly Meal[], date: string): Macros {
  return aggregateMacros(mealsForDate(meals, date).map(mealMacros));
}

/** Hay macros si algun nutriente numerico esta definido (kcalDerived no cuenta). */
export function hasMacros(macros: Macros): boolean {
  return (
    macros.protein !== undefined ||
    macros.fat !== undefined ||
    macros.kcal !== undefined ||
    macros.fiber !== undefined ||
    macros.sugars !== undefined
  );
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
