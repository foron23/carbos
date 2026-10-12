import { describe, expect, it } from 'vitest';
import { classForFood, foodForClass, missingClassTargets } from './classmap';
import { catalogSchema, foodSchema } from './schema';
import type { Food } from './types';
import { CATALOG_VERSION } from './types';

const tortilla: Food = {
  id: 'tortilla',
  name: { es: 'Tortilla', en: 'Omelette' },
  synonyms: ['tortilla de patatas'],
  carbsPer100g: 8.5,
  defaultPortionGrams: 200,
  source: 'test',
};

const catalog = { version: CATALOG_VERSION, foods: [tortilla] };

describe('catalog schema', () => {
  it('acepta un catalogo valido', () => {
    expect(catalogSchema.parse(catalog).foods).toHaveLength(1);
  });

  it('rechaza una porcion por defecto no positiva', () => {
    expect(() => foodSchema.parse({ ...tortilla, defaultPortionGrams: 0 })).toThrow();
  });

  it('rechaza una version de esquema distinta', () => {
    expect(() => catalogSchema.parse({ ...catalog, version: 99 })).toThrow();
  });

  it('rechaza carbohidratos negativos', () => {
    expect(() => foodSchema.parse({ ...tortilla, carbsPer100g: -1 })).toThrow();
  });
});

describe('class map', () => {
  it('detecta ids que no existen en el catalogo', () => {
    expect(missingClassTargets({ a: 'tortilla', b: 'fantasma' }, catalog)).toEqual(['fantasma']);
  });

  it('mapea clase y alimento en ambos sentidos', () => {
    const map = { tortilla_es: 'tortilla' };
    expect(foodForClass(map, 'tortilla_es')).toBe('tortilla');
    expect(classForFood(map, 'tortilla')).toBe('tortilla_es');
  });

  it('devuelve null si no hay mapeo', () => {
    expect(foodForClass({}, 'x')).toBeNull();
    expect(classForFood({}, 'tortilla')).toBeNull();
  });
});
