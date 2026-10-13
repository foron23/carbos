import { describe, expect, it } from 'vitest';
import type { FoodItem, Meal } from './types';
import {
  dayCarbs,
  itemCarbs,
  mealCarbs,
  roundCarbs,
  startOfWeek,
  weekBreakdown,
  weekCarbs,
} from './totals';

function food(grams: number, carbsPer100g: number): FoodItem {
  return { id: 'f', name: 'alimento', grams, carbsPer100g };
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
});
