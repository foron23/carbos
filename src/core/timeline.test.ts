import { describe, expect, it } from 'vitest';
import type { InsulinLog, Meal, MealGroup } from './types';
import { compareTimeline, dayTimeline } from './timeline';
import type { TimelineEntry } from './timeline';

function meal(id: string, date: string, time: string): Meal {
  return { id, date, time, items: [], confidence: null, origin: 'manual' };
}

function insulin(id: string, date: string, time: string): InsulinLog {
  return { id, date, time, units: 1, kind: 'bolus' };
}

describe('timeline', () => {
  it('mezcla comidas e insulina del dia ordenadas por hora', () => {
    const meals = [meal('m1', '2026-10-12', '08:00'), meal('m2', '2026-10-13', '07:00')];
    const logs = [insulin('i1', '2026-10-12', '08:30')];
    const entries = dayTimeline(meals, logs, '2026-10-12');
    expect(entries.map((entry) => entry.kind)).toEqual(['meal', 'insulin']);
    expect(entries.map((entry) => entry.time)).toEqual(['08:00', '08:30']);
  });

  it('empata la hora con la comida antes que la insulina', () => {
    const entries = dayTimeline(
      [meal('m1', '2026-10-12', '12:00')],
      [insulin('i1', '2026-10-12', '12:00')],
      '2026-10-12',
    );
    expect(entries.map((entry) => entry.kind)).toEqual(['meal', 'insulin']);
  });

  it('coloca una insulina anterior a una comida por delante', () => {
    const entries = dayTimeline(
      [meal('m1', '2026-10-12', '09:00')],
      [insulin('i1', '2026-10-12', '07:00')],
      '2026-10-12',
    );
    expect(entries.map((entry) => entry.kind)).toEqual(['insulin', 'meal']);
    expect(entries.map((entry) => entry.time)).toEqual(['07:00', '09:00']);
  });

  it('ordena comidas registradas fuera de orden', () => {
    const entries = dayTimeline(
      [meal('m2', '2026-10-12', '21:00'), meal('m1', '2026-10-12', '08:00')],
      [],
      '2026-10-12',
    );
    expect(entries.map((entry) => entry.time)).toEqual(['08:00', '21:00']);
  });

  it('compareTimeline da 0 entre entradas del mismo tipo', () => {
    const a: TimelineEntry = {
      kind: 'meal',
      time: '09:00',
      meal: meal('m1', '2026-10-12', '09:00'),
    };
    const b: TimelineEntry = {
      kind: 'meal',
      time: '09:00',
      meal: meal('m2', '2026-10-12', '09:00'),
    };
    expect(compareTimeline(a, b)).toBe(0);
  });

  it('un dia sin registros devuelve una lista vacia', () => {
    expect(dayTimeline([meal('m1', '2026-10-12', '08:00')], [], '2026-10-13')).toEqual([]);
  });

  it('pliega las comidas de un grupo y oculta las hijas sueltas', () => {
    const meals = [
      meal('m1', '2026-10-12', '08:05'),
      meal('m2', '2026-10-12', '08:20'),
      meal('m3', '2026-10-12', '12:00'),
    ];
    const group: MealGroup = { id: 'g1', date: '2026-10-12', mealIds: ['m1', 'm2'] };
    const entries = dayTimeline(meals, [], '2026-10-12', [group]);
    expect(entries.map((entry) => entry.kind)).toEqual(['group', 'meal']);
    const [first] = entries;
    expect(first?.kind).toBe('group');
    if (first?.kind === 'group') {
      expect(first.time).toBe('08:05');
      expect(first.meals.map((child) => child.id)).toEqual(['m1', 'm2']);
    }
    // Las hijas no aparecen tambien como comidas sueltas.
    const mealIds = entries.flatMap((entry) => (entry.kind === 'meal' ? [entry.meal.id] : []));
    expect(mealIds).toEqual(['m3']);
  });

  it('ignora grupos de otro dia o con menos de 2 hijas', () => {
    const meals = [meal('m1', '2026-10-12', '08:05'), meal('m2', '2026-10-12', '08:20')];
    const otherDay: MealGroup = { id: 'g1', date: '2026-10-13', mealIds: ['m1', 'm2'] };
    const orphan: MealGroup = { id: 'g2', date: '2026-10-12', mealIds: ['m1', 'zzz'] };
    const entries = dayTimeline(meals, [], '2026-10-12', [otherDay, orphan]);
    expect(entries.map((entry) => entry.kind)).toEqual(['meal', 'meal']);
  });

  it('coloca el grupo antes de una insulina con la misma hora', () => {
    const meals = [meal('m1', '2026-10-12', '08:00'), meal('m2', '2026-10-12', '08:00')];
    const group: MealGroup = { id: 'g1', date: '2026-10-12', mealIds: ['m1', 'm2'] };
    const entries = dayTimeline(meals, [insulin('i1', '2026-10-12', '08:00')], '2026-10-12', [
      group,
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(['group', 'insulin']);
  });
});
