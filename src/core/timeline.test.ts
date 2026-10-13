import { describe, expect, it } from 'vitest';
import type { InsulinLog, Meal } from './types';
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
});
