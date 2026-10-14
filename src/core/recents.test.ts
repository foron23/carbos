import { describe, expect, it } from 'vitest';
import { recentClassIds } from './recents';
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
