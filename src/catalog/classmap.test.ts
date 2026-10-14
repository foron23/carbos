import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import {
  DEFAULT_CLASSMAP,
  UNKNOWN_CLASS,
  classForFood,
  foodForClass,
  missingClassTargets,
  normalizeLabel,
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

  it('resuelve por identidad un modelo ya alineado al catalogo', () => {
    // El estudiante destilado al catalogo emite ids directamente (p.ej. "pan_blanco").
    const resolved = resolveClass(DEFAULT_CLASSMAP, 'pan_blanco', CATALOG);
    expect(resolved?.food.id).toBe('pan_blanco');
    expect(resolved?.classId).toBe('pan_blanco');
  });

  it('normaliza etiquetas de modelos publicos (D31)', () => {
    expect(normalizeLabel('Granny Smith')).toBe('granny_smith');
    expect(normalizeLabel('  ice cream ')).toBe('ice_cream');
    expect(normalizeLabel('French-loaf')).toBe('french_loaf');
    expect(resolveClass(DEFAULT_CLASSMAP, 'Granny Smith', CATALOG)?.food.id).toBe('manzana');
    expect(resolveClass(DEFAULT_CLASSMAP, 'head cabbage', CATALOG)?.food.id).toBe('repollo');
    expect(resolveClass(DEFAULT_CLASSMAP, 'ice cream', CATALOG)?.food.id).toBe('helado');
    expect(resolveClass(DEFAULT_CLASSMAP, 'bell pepper', CATALOG)?.food.id).toBe('pimiento_rojo');
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
