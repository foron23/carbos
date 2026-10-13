import { describe, expect, it } from 'vitest';
import { MAX_INSULIN_UNITS, MAX_MEAL_GRAMS, chatIntentSchema, parseIntent } from './intent';

describe('esquema de intenciones del chat', () => {
  it('acepta log_meal minimo', () => {
    const intent = parseIntent({ action: 'log_meal', items: [{ query: 'tortilla' }] });
    expect(intent).toEqual({ action: 'log_meal', items: [{ query: 'tortilla' }] });
  });

  it('acepta log_meal con fecha, hora y gramos', () => {
    const raw = {
      action: 'log_meal',
      date: '2026-10-13',
      time: '14:30',
      items: [{ query: 'arroz', grams: 150 }],
    };
    expect(parseIntent(raw)).toEqual(raw);
  });

  it('acepta log_insulin con tipo', () => {
    const raw = { action: 'log_insulin', time: '08:15', units: 6, kind: 'bolus' };
    expect(parseIntent(raw)).toEqual(raw);
  });

  it('acepta query_totals con y sin fecha', () => {
    expect(parseIntent({ action: 'query_totals' })).toEqual({ action: 'query_totals' });
    expect(parseIntent({ action: 'query_totals', date: '2026-10-13' })).toEqual({
      action: 'query_totals',
      date: '2026-10-13',
    });
  });

  it('acepta set_date', () => {
    expect(parseIntent({ action: 'set_date', date: '2026-10-13' })).toEqual({
      action: 'set_date',
      date: '2026-10-13',
    });
  });

  it('acepta unknown', () => {
    expect(parseIntent({ action: 'unknown' })).toEqual({ action: 'unknown' });
  });
});

describe('guarda .strict()', () => {
  it('rechaza una clave extra en la intencion', () => {
    const result = chatIntentSchema.safeParse({
      action: 'log_meal',
      items: [{ query: 'tortilla' }],
      surprise: true,
    });
    expect(result.success).toBe(false);
    expect(
      parseIntent({ action: 'log_meal', items: [{ query: 'tortilla' }], surprise: true }),
    ).toEqual({ action: 'unknown' });
  });

  it('rechaza una clave extra en un item', () => {
    const raw = {
      action: 'log_meal',
      items: [{ query: 'tortilla', foodId: 'inventado' }],
    };
    expect(chatIntentSchema.safeParse(raw).success).toBe(false);
    expect(parseIntent(raw)).toEqual({ action: 'unknown' });
  });

  it('rechaza una clave extra en unknown', () => {
    expect(chatIntentSchema.safeParse({ action: 'unknown', extra: 1 }).success).toBe(false);
  });

  it('rechaza una fecha o hora con formato invalido', () => {
    expect(chatIntentSchema.safeParse({ action: 'set_date', date: '13-10-2026' }).success).toBe(
      false,
    );
    expect(
      chatIntentSchema.safeParse({ action: 'log_insulin', time: '8:15', units: 6 }).success,
    ).toBe(false);
  });
});

describe('limites de gramos y unidades', () => {
  it('rechaza gramos fuera de rango', () => {
    expect(
      chatIntentSchema.safeParse({ action: 'log_meal', items: [{ query: 'x', grams: 0 }] }).success,
    ).toBe(false);
    expect(
      chatIntentSchema.safeParse({
        action: 'log_meal',
        items: [{ query: 'x', grams: MAX_MEAL_GRAMS + 1 }],
      }).success,
    ).toBe(false);
  });

  it('acepta gramos en el limite superior', () => {
    expect(
      chatIntentSchema.safeParse({
        action: 'log_meal',
        items: [{ query: 'x', grams: MAX_MEAL_GRAMS }],
      }).success,
    ).toBe(true);
  });

  it('rechaza unidades fuera de rango', () => {
    expect(chatIntentSchema.safeParse({ action: 'log_insulin', units: 0 }).success).toBe(false);
    expect(
      chatIntentSchema.safeParse({ action: 'log_insulin', units: MAX_INSULIN_UNITS + 1 }).success,
    ).toBe(false);
  });

  it('acepta unidades en el limite superior', () => {
    expect(
      chatIntentSchema.safeParse({ action: 'log_insulin', units: MAX_INSULIN_UNITS }).success,
    ).toBe(true);
  });
});

describe('linea regulatoria (por ausencia)', () => {
  it('no existe la accion compute_insulin', () => {
    expect(parseIntent({ action: 'compute_insulin', carbs: 45 })).toEqual({ action: 'unknown' });
  });

  it('no existe ningun campo carbs -> units', () => {
    expect(
      chatIntentSchema.safeParse({ action: 'log_meal', items: [{ query: 'x' }], units: 6 }).success,
    ).toBe(false);
    expect(chatIntentSchema.safeParse({ action: 'log_insulin', units: 6, carbs: 45 }).success).toBe(
      false,
    );
  });
});

describe('fallback unknown', () => {
  it('devuelve unknown ante entradas que no son objeto', () => {
    expect(parseIntent(null)).toEqual({ action: 'unknown' });
    expect(parseIntent('hola')).toEqual({ action: 'unknown' });
    expect(parseIntent(42)).toEqual({ action: 'unknown' });
    expect(parseIntent(undefined)).toEqual({ action: 'unknown' });
  });

  it('devuelve unknown ante objeto vacio, accion desconocida o campos faltantes', () => {
    expect(parseIntent({})).toEqual({ action: 'unknown' });
    expect(parseIntent({ action: 'nope' })).toEqual({ action: 'unknown' });
    expect(parseIntent({ action: 'log_meal' })).toEqual({ action: 'unknown' });
    expect(parseIntent({ action: 'set_date' })).toEqual({ action: 'unknown' });
  });
});
