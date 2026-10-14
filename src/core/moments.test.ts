import { describe, expect, it } from 'vitest';
import type { FoodItem, Meal } from './types';
import { carbsByMoment, momentOf } from './moments';
import { mealCarbs, roundCarbs } from './totals';

function food(grams: number, carbsPer100g: number): FoodItem {
  return { id: 'f', name: 'alimento', grams, carbsPer100g };
}

function meal(id: string, date: string, time: string, items: FoodItem[]): Meal {
  return { id, date, time, items, confidence: null, origin: 'manual' };
}

describe('momentOf', () => {
  it('clasifica los bordes de cada momento', () => {
    expect(momentOf('04:59')).toBe('evening');
    expect(momentOf('05:00')).toBe('morning');
    expect(momentOf('11:59')).toBe('morning');
    expect(momentOf('12:00')).toBe('afternoon');
    expect(momentOf('19:59')).toBe('afternoon');
    expect(momentOf('20:00')).toBe('evening');
    expect(momentOf('00:00')).toBe('evening');
    expect(momentOf('23:59')).toBe('evening');
  });

  it('cae en Noche ante una hora no parseable', () => {
    expect(momentOf('')).toBe('evening');
    expect(momentOf('25:00')).toBe('evening');
  });
});

describe('carbsByMoment', () => {
  it('agrupa dos comidas en momentos distintos y cuadra con el total', () => {
    const meals = [
      meal('m1', '2026-10-12', '08:30', [food(100, 30)]),
      meal('m2', '2026-10-12', '21:00', [food(200, 25)]),
    ];
    const buckets = carbsByMoment(meals);
    expect(buckets.morning).toBeCloseTo(30);
    expect(buckets.afternoon).toBeCloseTo(0);
    expect(buckets.evening).toBeCloseTo(50);

    const total = meals.reduce((sum, m) => sum + roundCarbs(mealCarbs(m)), 0);
    expect(buckets.morning + buckets.afternoon + buckets.evening).toBeCloseTo(total);
  });
});
