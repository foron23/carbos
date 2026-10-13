import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INSULIN_KIND,
  proposalToInsulinLog,
  proposalToMeal,
  resolveIntent,
  totalsForDate,
} from './resolve';
import type { ResolveDeps } from './resolve';
import type { ChatIntent } from './intent';
import type { Meal } from '../core/types';

const deps: ResolveDeps = {
  locale: 'es',
  currentDate: '2026-10-13',
  nowTime: '09:30',
};

function ids(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
}

describe('resolveIntent / log_meal', () => {
  it('resuelve un alimento del catalogo y calcula los carbohidratos', () => {
    const intent: ChatIntent = {
      action: 'log_meal',
      items: [{ query: 'pan blanco', grams: 100 }],
    };
    const proposal = resolveIntent(intent, deps);
    expect(proposal.kind).toBe('meal');
    if (proposal.kind !== 'meal') return;
    expect(proposal.date).toBe('2026-10-13');
    expect(proposal.time).toBe('09:30');
    expect(proposal.resolved).toBe(1);
    expect(proposal.unresolved).toBe(0);
    expect(proposal.items[0]).toMatchObject({
      query: 'pan blanco',
      foodId: 'pan_blanco',
      name: 'Pan blanco',
      grams: 100,
      carbsPer100g: 58.3,
    });
    expect(proposal.items[0]?.carbs).toBeCloseTo(58.3, 6);
    expect(proposal.carbs).toBeCloseTo(58.3, 6);
  });

  it('usa la porcion del catalogo cuando no vienen gramos', () => {
    const proposal = resolveIntent({ action: 'log_meal', items: [{ query: 'pan blanco' }] }, deps);
    if (proposal.kind !== 'meal') throw new Error('se esperaba una comida');
    expect(proposal.items[0]?.grams).toBe(60);
    expect(proposal.items[0]?.carbs).toBeCloseTo(34.98, 6);
  });

  it('marca como no resuelto un query que no casa con el catalogo', () => {
    const proposal = resolveIntent(
      { action: 'log_meal', items: [{ query: 'xyzzy inexistente' }] },
      deps,
    );
    if (proposal.kind !== 'meal') throw new Error('se esperaba una comida');
    expect(proposal.resolved).toBe(0);
    expect(proposal.unresolved).toBe(1);
    expect(proposal.items[0]).toMatchObject({ foodId: null, name: null, carbs: 0 });
    expect(proposal.carbs).toBe(0);
  });

  it('suma los carbohidratos de varios items', () => {
    const proposal = resolveIntent(
      {
        action: 'log_meal',
        items: [
          { query: 'pan blanco', grams: 100 },
          { query: 'pan blanco', grams: 50 },
        ],
      },
      deps,
    );
    if (proposal.kind !== 'meal') throw new Error('se esperaba una comida');
    expect(proposal.carbs).toBeCloseTo(58.3 + 29.15, 6);
  });

  it('traduce el nombre al idioma pedido', () => {
    const proposal = resolveIntent(
      { action: 'log_meal', items: [{ query: 'pan blanco' }] },
      { ...deps, locale: 'en' },
    );
    if (proposal.kind !== 'meal') throw new Error('se esperaba una comida');
    expect(proposal.items[0]?.name).toBe('White bread');
  });
});

describe('resolveIntent / otras intenciones', () => {
  it('propone un registro de insulina con la guarda ya aplicada', () => {
    const proposal = resolveIntent({ action: 'log_insulin', units: 6 }, deps);
    expect(proposal).toEqual({
      kind: 'insulin',
      date: '2026-10-13',
      time: '09:30',
      units: 6,
      insulinKind: DEFAULT_INSULIN_KIND,
    });
  });

  it('respeta la fecha y la hora explicitas', () => {
    const proposal = resolveIntent(
      { action: 'log_insulin', date: '2026-10-01', time: '08:00', units: 4, kind: 'basal' },
      deps,
    );
    if (proposal.kind !== 'insulin') throw new Error('se esperaba insulina');
    expect(proposal).toMatchObject({ date: '2026-10-01', time: '08:00', insulinKind: 'basal' });
  });

  it('mapea set_date, query_totals y unknown', () => {
    expect(resolveIntent({ action: 'set_date', date: '2026-01-02' }, deps)).toEqual({
      kind: 'date',
      date: '2026-01-02',
    });
    expect(resolveIntent({ action: 'query_totals' }, deps)).toEqual({
      kind: 'totals',
      date: '2026-10-13',
    });
    expect(resolveIntent({ action: 'unknown' }, deps)).toEqual({ kind: 'unknown' });
  });
});

describe('proposalToMeal / proposalToInsulinLog', () => {
  it('construye un Meal manual con classId del catalogo', () => {
    const proposal = resolveIntent(
      { action: 'log_meal', items: [{ query: 'pan blanco', grams: 100 }] },
      deps,
    );
    const meal = proposalToMeal(proposal, ids());
    expect(meal).toMatchObject({
      id: 'id-1',
      date: '2026-10-13',
      time: '09:30',
      confidence: null,
      origin: 'manual',
    });
    expect(meal?.items).toHaveLength(1);
    expect(meal?.items[0]).toMatchObject({
      id: 'id-2',
      name: 'Pan blanco',
      grams: 100,
      carbsPer100g: 58.3,
      classId: 'pan_blanco',
    });
  });

  it('no construye Meal si queda algun item sin resolver', () => {
    const proposal = resolveIntent(
      { action: 'log_meal', items: [{ query: 'xyzzy inexistente' }] },
      deps,
    );
    expect(proposalToMeal(proposal, ids())).toBeNull();
  });

  it('no construye Meal a partir de otra propuesta', () => {
    const proposal = resolveIntent({ action: 'query_totals' }, deps);
    expect(proposalToMeal(proposal, ids())).toBeNull();
  });

  it('construye el InsulinLog del registro propuesto', () => {
    const proposal = resolveIntent({ action: 'log_insulin', units: 6 }, deps);
    expect(proposalToInsulinLog(proposal, ids())).toEqual({
      id: 'id-1',
      date: '2026-10-13',
      time: '09:30',
      units: 6,
      kind: 'bolus',
    });
  });
});

describe('totalsForDate', () => {
  it('suma los carbohidratos del dia con totals.ts', () => {
    const meal: Meal = {
      id: 'm',
      date: '2026-10-13',
      time: '12:00',
      items: [{ id: 'i', name: 'Pan blanco', grams: 100, carbsPer100g: 58.3 }],
      confidence: null,
      origin: 'manual',
    };
    expect(totalsForDate([meal], '2026-10-13')).toBeCloseTo(58.3, 6);
    expect(totalsForDate([meal], '2026-10-14')).toBe(0);
  });
});
