import { describe, expect, it } from 'vitest';
import type { FoodItem, Meal } from './types';
import {
  dayCarbs,
  dayMacros,
  hasMacros,
  itemCarbs,
  itemMacros,
  mealCarbs,
  mealMacros,
  roundCarbs,
  startOfWeek,
  weekBreakdown,
  weekCarbs,
  targetProgress,
} from './totals';

function food(grams: number, carbsPer100g: number, extra: Partial<FoodItem> = {}): FoodItem {
  return { id: 'f', name: 'alimento', grams, carbsPer100g, ...extra };
}

function meal(id: string, date: string, time: string, items: FoodItem[]): Meal {
  return { id, date, time, items, confidence: null, origin: 'manual' };
}

describe('totals', () => {
  it('itemCarbs escala por 100 g', () => {
    expect(itemCarbs(food(150, 20))).toBeCloseTo(30);
  });

  it('mealCarbs suma los items', () => {
    const m = meal('m1', '2026-10-12', '14:00', [food(100, 20), food(50, 40)]);
    expect(mealCarbs(m)).toBeCloseTo(40);
  });

  it('dayCarbs filtra por fecha', () => {
    const meals = [
      meal('m1', '2026-10-12', '14:00', [food(100, 20)]),
      meal('m2', '2026-10-12', '21:00', [food(100, 30)]),
      meal('m3', '2026-10-11', '14:00', [food(100, 99)]),
    ];
    expect(dayCarbs(meals, '2026-10-12')).toBeCloseTo(50);
  });

  it('weekCarbs cubre siete dias desde el inicio', () => {
    const meals = [
      meal('m1', '2026-10-12', '14:00', [food(100, 20)]),
      meal('m2', '2026-10-18', '14:00', [food(100, 20)]),
      meal('m3', '2026-10-19', '14:00', [food(100, 99)]),
    ];
    expect(weekCarbs(meals, '2026-10-12')).toBeCloseTo(40);
  });

  it('startOfWeek devuelve el lunes de la semana ISO', () => {
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-15')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19');
  });

  it('weekBreakdown devuelve siete dias con el activo y un dia a cero', () => {
    const meals = [
      meal('m1', '2026-10-12', '14:00', [food(100, 20)]),
      meal('m2', '2026-10-15', '14:00', [food(100, 30)]),
    ];
    const days = weekBreakdown(meals, '2026-10-15');
    expect(days).toHaveLength(7);
    expect(days.map((day) => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(days.filter((day) => day.active)).toHaveLength(1);
    expect(days.find((day) => day.active)?.date).toBe('2026-10-15');
    expect(days.map((day) => day.carbs)).toEqual([20, 0, 0, 30, 0, 0, 0]);
  });

  it('roundCarbs redondea a una decimal', () => {
    expect(roundCarbs(12.34)).toBe(12.3);
    expect(roundCarbs(12.35)).toBe(12.4);
  });

  it('targetProgress calcula restante y ratio por debajo del objetivo', () => {
    const info = targetProgress(120, 180);
    expect(info.remaining).toBeCloseTo(60);
    expect(info.ratio).toBeCloseTo(120 / 180);
    expect(info.over).toBe(false);
  });

  it('targetProgress acota el ratio a 1 y no deja restante negativo al pasarse', () => {
    const info = targetProgress(200, 180);
    expect(info.remaining).toBe(0);
    expect(info.ratio).toBe(1);
    expect(info.over).toBe(true);
  });

  it('targetProgress trata un objetivo no positivo como sin objetivo', () => {
    const info = targetProgress(50, 0);
    expect(info.target).toBe(0);
    expect(info.ratio).toBe(0);
    expect(info.over).toBe(false);
  });

  it('targetProgress a la altura exacta del objetivo no marca over', () => {
    const info = targetProgress(180, 180);
    expect(info.remaining).toBe(0);
    expect(info.ratio).toBe(1);
    expect(info.over).toBe(false);
  });
});

describe('macros', () => {
  it('itemMacros escala protein, grasa, fibra y azucares por 100 g', () => {
    const macros = itemMacros(
      food(150, 20, {
        proteinPer100g: 10,
        fatPer100g: 4,
        fiberPer100g: 2,
        sugarsPer100g: 6,
      }),
    );
    expect(macros.protein).toBeCloseTo(15);
    expect(macros.fat).toBeCloseTo(6);
    expect(macros.fiber).toBeCloseTo(3);
    expect(macros.sugars).toBeCloseTo(9);
  });

  it('itemMacros deriva kcal 4/4/9 y la marca cuando falta la fuente', () => {
    const macros = itemMacros(food(100, 20, { proteinPer100g: 10, fatPer100g: 5 }));
    expect(macros.kcal).toBeCloseTo(4 * 10 + 4 * 20 + 9 * 5);
    expect(macros.kcalDerived).toBe(true);
  });

  it('itemMacros usa la kcal de la fuente y no la marca', () => {
    const macros = itemMacros(
      food(100, 20, { proteinPer100g: 10, fatPer100g: 5, kcalPer100g: 200 }),
    );
    expect(macros.kcal).toBeCloseTo(200);
    expect(macros.kcalDerived).toBe(false);
  });

  it('itemMacros respeta kcalDerived true de la fuente', () => {
    const macros = itemMacros(
      food(100, 20, { proteinPer100g: 10, fatPer100g: 5, kcalPer100g: 200, kcalDerived: true }),
    );
    expect(macros.kcalDerived).toBe(true);
  });

  it('itemMacros omite kcal si falta proteina o grasa', () => {
    const macros = itemMacros(food(100, 20, { proteinPer100g: 10 }));
    expect(macros.kcal).toBeUndefined();
    expect(macros.kcalDerived).toBeUndefined();
  });

  it('itemMacros omite fibra y azucares ausentes sin derivarlos', () => {
    const macros = itemMacros(food(100, 20, { proteinPer100g: 10, fatPer100g: 5 }));
    expect(macros.fiber).toBeUndefined();
    expect(macros.sugars).toBeUndefined();
  });

  it('mealMacros suma los valores definidos y omite los ausentes', () => {
    const macros = mealMacros(
      meal('m1', '2026-10-12', '14:00', [
        food(100, 20, { proteinPer100g: 10, fatPer100g: 5, kcalPer100g: 200 }),
        food(100, 20, { proteinPer100g: 4 }),
      ]),
    );
    expect(macros.protein).toBeCloseTo(14);
    expect(macros.fat).toBeCloseTo(5);
    expect(macros.kcal).toBeCloseTo(200);
    expect(macros.kcalDerived).toBe(false);
  });

  it('mealMacros marca kcalDerived si algun contribuyente es derivado', () => {
    const macros = mealMacros(
      meal('m1', '2026-10-12', '14:00', [
        food(100, 20, { proteinPer100g: 10, fatPer100g: 5, kcalPer100g: 200 }),
        food(100, 20, { proteinPer100g: 10, fatPer100g: 5 }),
      ]),
    );
    expect(macros.kcal).toBeCloseTo(200 + (4 * 10 + 4 * 20 + 9 * 5));
    expect(macros.kcalDerived).toBe(true);
  });

  it('mealMacros deja los nutrientes en undefined si ningun item los trae', () => {
    const macros = mealMacros(meal('m1', '2026-10-12', '14:00', [food(100, 20)]));
    expect(macros.protein).toBeUndefined();
    expect(macros.fat).toBeUndefined();
    expect(macros.kcal).toBeUndefined();
    expect(macros.kcalDerived).toBeUndefined();
    expect(macros.fiber).toBeUndefined();
    expect(macros.sugars).toBeUndefined();
  });

  it('dayMacros agrega solo las comidas de la fecha', () => {
    const meals = [
      meal('m1', '2026-10-12', '14:00', [
        food(100, 20, { proteinPer100g: 10, fatPer100g: 5, fiberPer100g: 4 }),
      ]),
      meal('m2', '2026-10-12', '21:00', [food(100, 20, { proteinPer100g: 20, sugarsPer100g: 8 })]),
      meal('m3', '2026-10-11', '14:00', [food(100, 20, { proteinPer100g: 99, fatPer100g: 99 })]),
    ];
    const macros = dayMacros(meals, '2026-10-12');
    expect(macros.protein).toBeCloseTo(30);
    expect(macros.fat).toBeCloseTo(5);
    expect(macros.fiber).toBeCloseTo(4);
    expect(macros.sugars).toBeCloseTo(8);
  });

  it('hasMacros detecta cualquier nutriente numerico (kcalDerived no cuenta)', () => {
    expect(hasMacros({})).toBe(false);
    expect(hasMacros({ kcalDerived: true })).toBe(false);
    expect(hasMacros({ protein: 0 })).toBe(true);
    expect(hasMacros({ fat: 0 })).toBe(true);
    expect(hasMacros({ kcal: 0 })).toBe(true);
    expect(hasMacros({ fiber: 0 })).toBe(true);
    expect(hasMacros({ sugars: 0 })).toBe(true);
  });
});
