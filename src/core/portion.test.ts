import { describe, expect, it } from 'vitest';
import { portionGrams, scaleGrams } from './portion';

describe('atajos de cantidad', () => {
  it('mitad y doble redondean con suelo de 1 g', () => {
    expect(scaleGrams(100, 0.5)).toBe(50);
    expect(scaleGrams(1, 0.5)).toBe(1);
    expect(scaleGrams(0, 2)).toBe(1);
  });
});

describe('porciones tipicas', () => {
  it('aplican los factores 0,7 / 1 / 1,4 con suelo de 1 g', () => {
    expect(portionGrams(60, 'medium')).toBe(60);
    expect(portionGrams(60, 'small')).toBe(42);
    expect(portionGrams(60, 'large')).toBe(84);
    expect(portionGrams(1, 'small')).toBe(1);
  });
});
