import { describe, expect, it } from 'vitest';
import { CATALOG, CATALOG_ATTRIBUTION } from './catalog';
import { catalogSchema } from './schema';

describe('catalogo generado', () => {
  it('valida contra el esquema', () => {
    expect(() => catalogSchema.parse(CATALOG)).not.toThrow();
  });

  it('tiene al menos 180 alimentos', () => {
    expect(CATALOG.foods.length).toBeGreaterThanOrEqual(180);
  });

  it('los ids son unicos', () => {
    const ids = CATALOG.foods.map((food) => food.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toda porcion por defecto es positiva y todo alimento cita su fuente', () => {
    for (const food of CATALOG.foods) {
      expect(food.defaultPortionGrams).toBeGreaterThan(0);
      expect(food.source.length).toBeGreaterThan(0);
    }
  });

  it('declara la atribucion de la fuente', () => {
    expect(CATALOG_ATTRIBUTION).toMatch(/Ciqual/i);
  });

  it('los platos de receta propia publican carbsRange con min <= nominal <= max', () => {
    const own = CATALOG.foods.filter((food) => food.source.startsWith('Receta propia'));
    for (const food of own) {
      expect(food.carbsRange).toBeDefined();
      const [min, max] = food.carbsRange as [number, number];
      expect(min).toBeLessThanOrEqual(food.carbsPer100g);
      expect(food.carbsPer100g).toBeLessThanOrEqual(max);
    }
  });
});
