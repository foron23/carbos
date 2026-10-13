import { describe, expect, it } from 'vitest';
import { migrateVault, slotToTime, upgradeMeal } from './migrate';
import { SCHEMA_VERSION } from './types';

describe('migracion de esquema (slot -> time)', () => {
  it('la version actual es 3', () => {
    expect(SCHEMA_VERSION).toBe(3);
  });

  it('sube un vault v1 a v3 con time desde la franja y origin manual', () => {
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
    expect(vault.version).toBe(3);
    expect(vault.meals[0]?.time).toBe('14:00');
    expect(vault.meals[0]?.origin).toBe('manual');
  });

  it('sube un vault v2 a v3 conservando origin', () => {
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
    const vault = migrateVault(current);
    expect(vault.version).toBe(3);
    expect(vault.meals[0]?.time).toBe('21:00');
    expect(vault.meals[0]?.origin).toBe('photo');
  });

  it('no pierde comidas ni su orden al migrar', () => {
    const legacy = {
      version: 1,
      meals: [
        { id: 'a', date: '2026-10-12', slot: 'breakfast', items: [], confidence: null },
        { id: 'b', date: '2026-10-12', slot: 'lunch', items: [], confidence: null },
        { id: 'c', date: '2026-10-12', slot: 'dinner', items: [], confidence: null },
      ],
      insulin: [],
    };
    const vault = migrateVault(legacy);
    expect(vault.meals.map((meal) => meal.id)).toEqual(['a', 'b', 'c']);
    expect(vault.meals.map((meal) => meal.time)).toEqual(['08:00', '14:00', '21:00']);
  });

  it('tolera una comida v3 con slot colgando', () => {
    const vault = migrateVault({
      version: 3,
      meals: [
        {
          id: 'm1',
          date: '2026-10-12',
          time: '09:15',
          slot: 'snack',
          items: [],
          confidence: null,
          origin: 'manual',
        },
      ],
      insulin: [],
    });
    expect(vault.meals[0]?.time).toBe('09:15');
    expect(vault.meals[0]).not.toHaveProperty('slot');
  });

  it('rechaza una version desconocida', () => {
    expect(() => migrateVault({ version: 7, meals: [], insulin: [] })).toThrow();
  });

  it('upgradeMeal rellena origin y usa 12:00 sin franja ni hora', () => {
    const meal = upgradeMeal({
      id: 'm1',
      date: '2026-10-12',
      items: [],
      confidence: null,
    });
    expect(meal.origin).toBe('manual');
    expect(meal.time).toBe('12:00');
  });

  it('upgradeMeal conserva una hora explicita', () => {
    const meal = upgradeMeal({
      id: 'm1',
      date: '2026-10-12',
      time: '07:45',
      items: [],
      confidence: null,
      origin: 'photo',
    });
    expect(meal.time).toBe('07:45');
    expect(meal.origin).toBe('photo');
  });

  it('slotToTime mapea las franjas conocidas y cae a 12:00', () => {
    expect(slotToTime('breakfast')).toBe('08:00');
    expect(slotToTime('lunch')).toBe('14:00');
    expect(slotToTime('dinner')).toBe('21:00');
    expect(slotToTime('snack')).toBe('17:00');
    expect(slotToTime(undefined)).toBe('12:00');
    expect(slotToTime('merienda')).toBe('12:00');
  });

  it('slotToTime no confunde claves del prototipo con franjas', () => {
    expect(slotToTime('toString')).toBe('12:00');
    expect(slotToTime('constructor')).toBe('12:00');
    expect(slotToTime('__proto__')).toBe('12:00');
  });

  it('upgradeMeal no rompe con una franja tipo toString y hora vacia', () => {
    const meal = upgradeMeal({
      id: 'm1',
      date: '2026-10-12',
      time: '',
      slot: 'toString',
      items: [],
      confidence: null,
    });
    expect(meal.time).toBe('12:00');
  });

  it('upgradeMeal cae a la franja si la hora esta vacia', () => {
    const meal = upgradeMeal({
      id: 'm1',
      date: '2026-10-12',
      time: '',
      slot: 'lunch',
      items: [],
      confidence: null,
    });
    expect(meal.time).toBe('14:00');
  });

  it('upgradeMeal cae a la franja si la hora esta mal formada', () => {
    const meal = upgradeMeal({
      id: 'm1',
      date: '2026-10-12',
      time: '9:5',
      slot: 'dinner',
      items: [],
      confidence: null,
    });
    expect(meal.time).toBe('21:00');
  });

  it('upgradeMeal conserva una hora valida', () => {
    const meal = upgradeMeal({
      id: 'm1',
      date: '2026-10-12',
      time: '07:30',
      slot: 'dinner',
      items: [],
      confidence: null,
    });
    expect(meal.time).toBe('07:30');
  });

  it('upgradeMeal usa 12:00 sin hora ni franja', () => {
    const meal = upgradeMeal({
      id: 'm1',
      date: '2026-10-12',
      time: '',
      items: [],
      confidence: null,
    });
    expect(meal.time).toBe('12:00');
  });
});
