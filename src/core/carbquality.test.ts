import { describe, expect, it } from 'vitest';
import { carbQualityBand } from './carbquality';

describe('calidad del carbohidrato (fibra)', () => {
  it('clasifica por los umbrales UE de fibra (fuente 3, alto 6)', () => {
    expect(carbQualityBand(40, 6)).toBe('high');
    expect(carbQualityBand(40, 7.2)).toBe('high');
    expect(carbQualityBand(40, 3)).toBe('medium');
    expect(carbQualityBand(40, 5.9)).toBe('medium');
    expect(carbQualityBand(40, 2.9)).toBe('low');
    expect(carbQualityBand(40, 0)).toBe('low');
  });

  it('oculta la banda si el alimento no es fuente de carbohidratos', () => {
    expect(carbQualityBand(4.9, 8)).toBeNull();
    expect(carbQualityBand(0, 0)).toBeNull();
  });

  it('oculta la banda si no se conoce la fibra (no se inventa)', () => {
    expect(carbQualityBand(40, undefined)).toBeNull();
    expect(carbQualityBand(40, Number.NaN)).toBeNull();
  });

  it('trata los valores limite como fuente/alto', () => {
    expect(carbQualityBand(5, 3)).toBe('medium');
    expect(carbQualityBand(40, 6)).toBe('high');
  });

  it('no depende de la porcion: el dato es por 100 g', () => {
    expect(carbQualityBand(40, 4)).toBe(carbQualityBand(40.0001, 4));
  });
});
