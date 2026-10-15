import { describe, expect, it } from 'vitest';
import { fromJson, toJson } from './export';
import { vaultSchema } from './schema';
import { SCHEMA_VERSION, emptyVault } from './types';

describe('exportacion JSON', () => {
  it('toJson y fromJson hacen ida y vuelta con time', () => {
    const vault = emptyVault();
    vault.meals.push({
      id: 'm1',
      date: '2026-10-12',
      time: '14:00',
      items: [{ id: 'f1', name: 'tortilla', grams: 150, carbsPer100g: 4 }],
      confidence: 0.8,
      origin: 'manual',
    });
    const text = toJson(vault);
    expect(text).toContain(`"version": ${SCHEMA_VERSION}`);
    const parsed = JSON.parse(text) as { meals: Record<string, unknown>[] };
    expect(parsed.meals).toHaveLength(1);
    for (const meal of parsed.meals) {
      expect(meal).toHaveProperty('time');
      expect(Object.prototype.hasOwnProperty.call(meal, 'slot')).toBe(false);
    }
    expect(fromJson(text)).toEqual(vault);
  });

  it('toJson incluye los grupos y hacen ida y vuelta', () => {
    const vault = emptyVault();
    vault.meals.push(
      {
        id: 'm1',
        date: '2026-10-12',
        time: '08:05',
        items: [{ id: 'f1', name: 'tostada', grams: 60, carbsPer100g: 50 }],
        confidence: null,
        origin: 'manual',
      },
      {
        id: 'm2',
        date: '2026-10-12',
        time: '08:20',
        items: [{ id: 'f2', name: 'cafe', grams: 100, carbsPer100g: 2 }],
        confidence: null,
        origin: 'manual',
      },
    );
    vault.groups = [{ id: 'g1', date: '2026-10-12', name: 'Desayuno', mealIds: ['m1', 'm2'] }];
    const text = toJson(vault);
    expect(text).toContain('"groups"');
    const parsed = JSON.parse(text) as { groups?: unknown[] };
    expect(parsed.groups).toHaveLength(1);
    expect(fromJson(text)).toEqual(vault);
  });

  it('fromJson normaliza grupos invalidos a solo los validos', () => {
    const legacy = {
      version: 3,
      meals: [],
      insulin: [],
      groups: [
        { id: 'g1', date: '2026-10-12', mealIds: ['m1', 'm2'] },
        { id: '', mealIds: [] },
      ],
    };
    const vault = fromJson(JSON.stringify(legacy));
    expect(vault.version).toBe(SCHEMA_VERSION);
    expect(vault.groups).toEqual([{ id: 'g1', date: '2026-10-12', mealIds: ['m1', 'm2'] }]);
  });

  it('un classId slot en el top-k no se confunde con la clave de franja', () => {
    const vault = emptyVault();
    vault.meals.push({
      id: 'm1',
      date: '2026-10-12',
      time: '12:00',
      items: [{ id: 'f1', name: 'slot', grams: 100, carbsPer100g: 10, classId: 'slot' }],
      confidence: 0.5,
      origin: 'photo',
      model: {
        detector: 'yolo',
        classifier: 'mobilenet',
        topk: [{ classId: 'slot', p: 0.9 }],
      },
    });
    const parsed = JSON.parse(toJson(vault)) as {
      meals: { time?: string; model?: { topk: { classId: string }[] } }[];
    };
    const meal = parsed.meals[0];
    expect(meal).toHaveProperty('time');
    expect(meal && Object.prototype.hasOwnProperty.call(meal, 'slot')).toBe(false);
    expect(meal?.model?.topk[0]?.classId).toBe('slot');
    expect(fromJson(toJson(vault))).toEqual(vault);
  });

  it('migra un export v1 con slot a time y version 3', () => {
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
    expect(migrated.meals[0]?.time).toBe('14:00');
    expect(migrated.meals[0]?.origin).toBe('manual');
  });

  it('migra un export v2 con slot a time', () => {
    const legacy = {
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
    const migrated = fromJson(JSON.stringify(legacy));
    expect(migrated.version).toBe(SCHEMA_VERSION);
    expect(migrated.meals[0]?.time).toBe('21:00');
    expect(migrated.meals[0]?.origin).toBe('photo');
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
          time: '14:00',
          items: [],
          confidence: null,
          origin: 'manual',
        },
      ],
      insulin: [],
    };
    expect(vaultSchema.safeParse(bad).success).toBe(false);
  });

  it('rechaza una comida sin time', () => {
    const bad = {
      version: SCHEMA_VERSION,
      meals: [
        {
          id: 'm',
          date: '2026-10-12',
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
      time: '13:30',
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
