import { describe, expect, it } from 'vitest';
import type { FoodItem, Meal, MealSlot } from './types';
import { dayCarbs, itemCarbs, mealCarbs, roundCarbs, weekCarbs } from './totals';

function food(grams: number, carbsPer100g: number): FoodItem {
  return { id: 'f', name: 'alimento', grams, carbsPer100g };
}

function meal(id: string, date: string, slot: MealSlot, items: FoodItem[]): Meal {
  return { id, date, slot, items, confidence: null };
}

describe('totals', () => {
  it('itemCarbs escala por 100 g', () => {
    expect(itemCarbs(food(150, 20))).toBeCloseTo(30);
  });

  it('mealCarbs suma los items', () => {
    const m = meal('m1', '2026-10-12', 'lunch', [food(100, 20), food(50, 40)]);
    expect(mealCarbs(m)).toBeCloseTo(40);
  });

  it('dayCarbs filtra por fecha', () => {
    const meals = [
      meal('m1', '2026-10-12', 'lunch', [food(100, 20)]),
      meal('m2', '2026-10-12', 'dinner', [food(100, 30)]),
      meal('m3', '2026-10-11', 'lunch', [food(100, 99)]),
    ];
    expect(dayCarbs(meals, '2026-10-12')).toBeCloseTo(50);
  });

  it('weekCarbs cubre siete dias desde el inicio', () => {
    const meals = [
      meal('m1', '2026-10-12', 'lunch', [food(100, 20)]),
      meal('m2', '2026-10-18', 'lunch', [food(100, 20)]),
      meal('m3', '2026-10-19', 'lunch', [food(100, 99)]),
    ];
    expect(weekCarbs(meals, '2026-10-12')).toBeCloseTo(40);
  });

  it('roundCarbs redondea a una decimal', () => {
    expect(roundCarbs(12.34)).toBe(12.3);
    expect(roundCarbs(12.35)).toBe(12.4);
  });
});
