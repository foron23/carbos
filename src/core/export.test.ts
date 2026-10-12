import { describe, expect, it } from 'vitest';
import { fromJson, toJson } from './export';
import { vaultSchema } from './schema';
import { SCHEMA_VERSION, emptyVault } from './types';

describe('exportacion JSON', () => {
  it('toJson y fromJson hacen ida y vuelta', () => {
    const vault = emptyVault();
    vault.meals.push({
      id: 'm1',
      date: '2026-10-12',
      slot: 'lunch',
      items: [{ id: 'f1', name: 'tortilla', grams: 150, carbsPer100g: 4 }],
      confidence: 0.8,
    });
    const text = toJson(vault);
    expect(text).toContain('"version": 1');
    expect(fromJson(text)).toEqual(vault);
  });
});

describe('vaultSchema', () => {
  it('rechaza una version desconocida', () => {
    const bad = { version: 999, meals: [], insulin: [] };
    expect(vaultSchema.safeParse(bad).success).toBe(false);
  });

  it('rechaza una fecha mal formada', () => {
    const bad = {
      version: SCHEMA_VERSION,
      meals: [
        { id: 'm', date: '12/10/2026', slot: 'lunch', items: [], confidence: null },
      ],
      insulin: [],
    };
    expect(vaultSchema.safeParse(bad).success).toBe(false);
  });

  it('acepta un vault vacio', () => {
    expect(vaultSchema.safeParse(emptyVault()).success).toBe(true);
  });
});
