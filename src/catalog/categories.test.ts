import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoryOf, curatedIdCount, foodsByCategory } from './categories';
import { CATALOG } from './catalog';

describe('categorias curadas (D64)', () => {
  it('todo id del catalogo tiene una categoria (paridad)', () => {
    const missing = CATALOG.foods.filter((food) => categoryOf(food.id) === null).map((f) => f.id);
    expect(missing).toEqual([]);
  });

  it('no hay ids curados de mas ni repetidos (biyeccion con el catalogo)', () => {
    // La suma de entradas curadas iguala el catalogo solo si no hay duplicados
    // ni huerfanos (con la paridad de arriba ya comprobada).
    expect(curatedIdCount()).toBe(CATALOG.foods.length);
  });

  it('ninguna categoria queda vacia', () => {
    for (const category of CATEGORIES) {
      expect(foodsByCategory(category).length).toBeGreaterThan(0);
    }
  });

  it('un id desconocido no tiene categoria', () => {
    expect(categoryOf('no_existe')).toBeNull();
  });

  it('resuelve alimentos conocidos a su categoria', () => {
    expect(categoryOf('manzana')).toBe('fruits');
    expect(categoryOf('pan_blanco')).toBe('cereals');
    expect(categoryOf('pollo_pechuga')).toBe('protein');
  });
});
