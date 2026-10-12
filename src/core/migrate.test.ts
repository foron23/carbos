import { describe, expect, it } from 'vitest';
import { migrateVault, upgradeMeal } from './migrate';
import { SCHEMA_VERSION } from './types';

describe('migracion de esquema (1 -> 2)', () => {
  it('la version actual es 2', () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('sube un vault v1 a v2 con origin manual', () => {
    const legacy = {
      version: 1,
      meals: [
        {
          id: 'm1',
          date: '2026-10-12',
          slot: 'lunch',
          items: [{ id: 'f1', name: 'pan', grams: 60, carbsPer100g: 50 }],
          confidence: null,
        },
      ],
      insulin: [],
    };
    const vault = migrateVault(legacy);
    expect(vault.version).toBe(2);
    expect(vault.meals[0]?.origin).toBe('manual');
  });

  it('conserva un vault v2 sin cambios', () => {
    const current = {
      version: 2,
      meals: [
        {
          id: 'm1',
          date: '2026-10-12',
          slot: 'dinner',
          items: [],
          confidence: null,
          origin: 'photo',
        },
      ],
      insulin: [],
    };
    expect(migrateVault(current).meals[0]?.origin).toBe('photo');
  });

  it('rechaza una version desconocida', () => {
    expect(() => migrateVault({ version: 7, meals: [], insulin: [] })).toThrow();
  });

  it('upgradeMeal rellena origin si falta', () => {
    const meal = upgradeMeal({
      id: 'm1',
      date: '2026-10-12',
      slot: 'snack',
      items: [],
      confidence: null,
    });
    expect(meal.origin).toBe('manual');
  });
});
