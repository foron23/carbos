import { describe, expect, it } from 'vitest';
import { recentClassIds, usageCounts } from './recents';
import type { Meal } from './types';

function meal(date: string, time: string, classIds: Array<string | undefined>): Meal {
  return {
    id: `${date}T${time}`,
    date,
    time,
    confidence: null,
    origin: 'manual',
    items: classIds.map((classId, index) => ({
      id: `${date}T${time}-${index}`,
      name: classId ?? 'desconocido',
      grams: 100,
      carbsPer100g: 10,
      classId,
    })),
  };
}

describe('recentClassIds', () => {
  it('devuelve los classId del mas reciente al mas antiguo', () => {
    const meals = [
      meal('2026-10-14', '08:00', ['pan']),
      meal('2026-10-15', '08:00', ['cafe']),
      meal('2026-10-15', '14:00', ['arroz']),
    ];
    expect(recentClassIds(meals)).toEqual(['arroz', 'cafe', 'pan']);
  });

  it('deduplica manteniendo la aparicion mas reciente', () => {
    const meals = [
      meal('2026-10-14', '08:00', ['pan']),
      meal('2026-10-15', '08:00', ['cafe', 'pan']),
    ];
    expect(recentClassIds(meals)).toEqual(['cafe', 'pan']);
  });

  it('ignora items sin classId', () => {
    const meals = [meal('2026-10-15', '08:00', [undefined, 'pan'])];
    expect(recentClassIds(meals)).toEqual(['pan']);
  });

  it('respeta el limite', () => {
    const meals = [meal('2026-10-15', '08:00', ['a', 'b', 'c', 'd'])];
    expect(recentClassIds(meals, 2)).toEqual(['a', 'b']);
  });

  it('devuelve vacio sin comidas o con limite no positivo', () => {
    expect(recentClassIds([])).toEqual([]);
    expect(recentClassIds([meal('2026-10-15', '08:00', ['pan'])], 0)).toEqual([]);
  });
});

describe('usageCounts (D63)', () => {
  it('cuenta las apariciones de cada classId en el diario', () => {
    const meals = [
      meal('2026-10-15', '08:00', ['manzana', 'pan']),
      meal('2026-10-16', '08:00', ['manzana']),
    ];
    expect(usageCounts(meals).get('manzana')).toBe(2);
    expect(usageCounts(meals).get('pan')).toBe(1);
  });

  it('ignora los items sin classId', () => {
    const counts = usageCounts([meal('2026-10-15', '08:00', [undefined, 'pan'])]);
    expect(counts.get('pan')).toBe(1);
    expect([...counts.values()].reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  it('devuelve un mapa vacio sin comidas', () => {
    expect(usageCounts([]).size).toBe(0);
  });
});
