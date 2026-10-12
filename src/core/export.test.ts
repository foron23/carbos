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
      origin: 'manual',
    });
    const text = toJson(vault);
    expect(text).toContain(`"version": ${SCHEMA_VERSION}`);
    expect(fromJson(text)).toEqual(vault);
  });

  it('migra un export v1 anadiendo origin manual', () => {
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
    const migrated = fromJson(JSON.stringify(legacy));
    expect(migrated.version).toBe(SCHEMA_VERSION);
    expect(migrated.meals[0]?.origin).toBe('manual');
  });

  it('rechaza una version no soportada', () => {
    expect(() => fromJson(JSON.stringify({ version: 999, meals: [], insulin: [] }))).toThrow();
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
        {
          id: 'm',
          date: '12/10/2026',
          slot: 'lunch',
          items: [],
          confidence: null,
          origin: 'manual',
        },
      ],
      insulin: [],
    };
    expect(vaultSchema.safeParse(bad).success).toBe(false);
  });

  it('acepta un vault vacio', () => {
    expect(vaultSchema.safeParse(emptyVault()).success).toBe(true);
  });

  it('acepta metadatos de modelo en una comida de foto', () => {
    const vault = emptyVault();
    vault.meals.push({
      id: 'm1',
      date: '2026-10-12',
      slot: 'lunch',
      items: [{ id: 'f1', name: 'manzana', grams: 180, carbsPer100g: 13.8, classId: 'apple' }],
      confidence: 0.7,
      origin: 'photo',
      model: {
        detector: 'yolo',
        classifier: 'mobilenet',
        topk: [{ classId: 'apple', p: 0.7 }],
      },
    });
    expect(vaultSchema.safeParse(vault).success).toBe(true);
  });
});
