import { describe, expect, it } from 'vitest';
import {
  PHOTO_PORTION_FACTORS,
  SIZE_THRESHOLDS,
  type PortionBox,
  type PortionSize,
  suggestPortion,
} from './portion';

function box(w: number, h: number, x = 0, y = 0): PortionBox {
  return { x, y, w, h };
}

describe('PHOTO_PORTION_FACTORS / SIZE_THRESHOLDS', () => {
  it('expone los factores y umbrales documentados', () => {
    expect(PHOTO_PORTION_FACTORS).toEqual({ small: 0.7, medium: 1, large: 1.4 });
    expect(SIZE_THRESHOLDS).toEqual({ smallMax: 0.15, largeMin: 0.35 });
  });
});

describe('suggestPortion tamanos', () => {
  it('medium reproduce el valor por defecto del catalogo', () => {
    expect(suggestPortion(box(0.4, 0.4, 0.2, 0.2), 60)).toEqual({ size: 'medium', grams: 60 });
  });

  it('small aplica 0.7x', () => {
    expect(suggestPortion(box(0.2, 0.2), 60)).toEqual({ size: 'small', grams: 42 });
  });

  it('large aplica 1.4x', () => {
    expect(suggestPortion(box(0.8, 0.8), 60)).toEqual({ size: 'large', grams: 84 });
  });

  it('el limite 0.15 pertenece a medium', () => {
    expect(suggestPortion(box(0.5, 0.3), 60)).toEqual({ size: 'medium', grams: 60 });
  });

  it('el limite 0.35 pertenece a large', () => {
    expect(suggestPortion(box(0.7, 0.5), 60)).toEqual({ size: 'large', grams: 84 });
  });

  it('extensión fuera de rango se recorta a large', () => {
    expect(suggestPortion(box(2, 2), 60)).toEqual({ size: 'large', grams: 84 });
  });

  it('valor de catálogo grande 250 g', () => {
    expect(suggestPortion(box(0.6, 0.6), 250)).toEqual({ size: 'large', grams: 350 });
  });
});

describe('suggestPortion redondeo y suelo de 1 g', () => {
  it('suelo de 1 g con valor por defecto diminuto', () => {
    expect(suggestPortion(box(0.1, 0.1), 1)).toEqual({ size: 'small', grams: 1 });
  });

  it('valor por defecto no positivo produce 1 g', () => {
    expect(suggestPortion(box(0.8, 0.8), 0)).toEqual({ size: 'large', grams: 1 });
  });

  it('valor por defecto NaN produce 1 g', () => {
    expect(suggestPortion(box(0.4, 0.4), NaN)).toEqual({ size: 'medium', grams: 1 });
  });

  it('caso de redondeo mitad', () => {
    expect(suggestPortion(box(0.1, 0.1), 5)).toEqual({ size: 'small', grams: 4 });
  });
});

describe('suggestPortion cajas degeneradas', () => {
  it('caja cero es segura y small', () => {
    expect(suggestPortion(box(0, 0), 60)).toEqual({ size: 'small', grams: 42 });
  });

  it('caja con NaN es segura y small', () => {
    expect(suggestPortion(box(NaN, NaN, NaN, NaN), 60)).toEqual({ size: 'small', grams: 42 });
  });

  it('caja con Infinity es segura y small', () => {
    expect(suggestPortion(box(Infinity, 0.5), 60)).toEqual({ size: 'small', grams: 42 });
  });

  it('w/h negativos se sanean a 0', () => {
    expect(suggestPortion(box(-1, -1), 60)).toEqual({ size: 'small', grams: 42 });
  });
});

describe('suggestPortion monotonía y determinismo', () => {
  it('area mayor nunca produce menos gramos', () => {
    const areas = [0.01, 0.1, 0.14, 0.15, 0.2, 0.34, 0.35, 0.5];
    const expectedSizes: PortionSize[] = [
      'small',
      'small',
      'small',
      'medium',
      'medium',
      'medium',
      'large',
      'large',
    ];
    const expectedGrams = [70, 70, 70, 100, 100, 100, 140, 140];

    const results = areas.map((area) => suggestPortion(box(area, 1), 100));

    expect(results.map((r) => r.size)).toEqual(expectedSizes);
    expect(results.map((r) => r.grams)).toEqual(expectedGrams);

    for (let i = 1; i < results.length; i += 1) {
      expect(results[i]!.grams).toBeGreaterThanOrEqual(results[i - 1]!.grams);
    }
  });

  it('area mayor nunca produce menos gramos con valor por defecto enorme (sin overflow)', () => {
    const huge = 1.5e308;
    const small = suggestPortion(box(0.1, 1), huge);
    const medium = suggestPortion(box(0.2, 1), huge);
    const large = suggestPortion(box(0.9, 1), huge);

    expect(small.grams).toBeLessThanOrEqual(medium.grams);
    expect(medium.grams).toBeLessThanOrEqual(large.grams);
    expect(Number.isFinite(large.grams)).toBe(true);
  });

  it('la misma entrada produce resultados deep-equal', () => {
    const input = box(0.42, 0.37, 0.1, 0.2);
    expect(suggestPortion(input, 123)).toEqual(suggestPortion(input, 123));
  });

  it('box.x / box.y no afectan tamano ni gramos', () => {
    const a = suggestPortion(box(0.5, 0.5, 0, 0), 80);
    const b = suggestPortion(box(0.5, 0.5, 100, -50), 80);
    expect(a).toEqual(b);
  });
});
