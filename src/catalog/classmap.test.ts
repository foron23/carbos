import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import {
  DEFAULT_CLASSMAP,
  UNKNOWN_CLASS,
  classForFood,
  foodForClass,
  missingClassTargets,
  resolveClass,
} from './classmap';
import { foodById, searchFoods } from './search';

describe('mapa de clases (E2)', () => {
  it('todos los destinos del mapa existen en el catalogo', () => {
    expect(missingClassTargets(DEFAULT_CLASSMAP, CATALOG)).toEqual([]);
  });

  it('las etiquetas del mapa son unicas', () => {
    const labels = Object.keys(DEFAULT_CLASSMAP);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('mapea clase y alimento en ambos sentidos', () => {
    expect(foodForClass(DEFAULT_CLASSMAP, 'apple')).toBe('manzana');
    expect(classForFood(DEFAULT_CLASSMAP, 'manzana')).toBe('apple');
  });

  it('resuelve una clase conocida a su alimento', () => {
    const resolved = resolveClass(DEFAULT_CLASSMAP, 'apple', CATALOG);
    expect(resolved?.food.id).toBe('manzana');
    expect(resolved?.classId).toBe('apple');
  });

  it('deja pasar la clase desconocida sin resolver', () => {
    expect(resolveClass(DEFAULT_CLASSMAP, 'platillo_volador', CATALOG)).toBeNull();
    expect(UNKNOWN_CLASS).toBe('desconocido');
  });
});

describe('busqueda manual', () => {
  it('encuentra por nombre exacto', () => {
    expect(searchFoods('manzana')[0]?.id).toBe('manzana');
  });

  it('ignora acentos', () => {
    expect(searchFoods('platano').some((food) => food.id === 'platano')).toBe(true);
  });

  it('encuentra por sinonimo', () => {
    expect(searchFoods('baguette').some((food) => food.id === 'pan_blanco')).toBe(true);
  });

  it('devuelve null para un id inexistente', () => {
    expect(foodById('no-existe')).toBeNull();
  });
});
