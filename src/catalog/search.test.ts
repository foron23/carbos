import { describe, expect, it } from 'vitest';
import { searchFoods } from './search';
import type { Catalog, Food } from './types';

function food(id: string, es: string, en: string): Food {
  return {
    id,
    name: { es, en },
    synonyms: [],
    carbsPer100g: 10,
    defaultPortionGrams: 100,
    source: 'test',
  };
}

// 'pan' da relevancia 80 a "Pan A/B" (prefijo) y 50 a "Empanada" (incluye).
const catalog: Catalog = {
  version: 1,
  foods: [
    food('a', 'Pan A', 'Bread A'),
    food('b', 'Pan B', 'Bread B'),
    food('c', 'Empanada', 'Pie'),
  ],
};

const ids = (usage?: ReadonlyMap<string, number>): string[] =>
  searchFoods('pan', 8, catalog, usage).map((entry) => entry.id);

describe('searchFoods (D63)', () => {
  it('sin usage no cambia el orden: relevancia y luego nombre', () => {
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('a igual relevancia, el uso desempata (el frecuente primero)', () => {
    expect(ids(new Map([['b', 5]]))).toEqual(['b', 'a', 'c']);
  });

  it('el uso no adelanta un resultado de menor relevancia', () => {
    expect(ids(new Map([['c', 99]]))).toEqual(['a', 'b', 'c']);
  });

  it('respeta el limite', () => {
    expect(searchFoods('pan', 1, catalog).map((entry) => entry.id)).toEqual(['a']);
  });

  it('una consulta vacia devuelve el catalogo en orden', () => {
    expect(searchFoods('', 2, catalog).map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});
