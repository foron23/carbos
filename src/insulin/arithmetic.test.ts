import { describe, expect, it } from 'vitest';
import { arithmeticTerms, bolusArithmetic, insulinParamsSchema } from './arithmetic';

describe('aritmetica de insulina (modulo opt-in)', () => {
  it('suma comida y correccion', () => {
    const total = bolusArithmetic({
      ratio: 10,
      correctionFactor: 50,
      target: 100,
      current: 150,
      carbs: 60,
    });
    expect(total).toBeCloseTo(7);
  });

  it('nunca devuelve un numero negativo', () => {
    const total = bolusArithmetic({
      ratio: 10,
      correctionFactor: 50,
      target: 100,
      current: 40,
      carbs: 0,
    });
    expect(total).toBe(0);
  });

  it('desglosa los terminos', () => {
    const terms = arithmeticTerms({
      ratio: 10,
      correctionFactor: 50,
      target: 100,
      current: 150,
      carbs: 60,
    });
    expect(terms.forMeal).toBeCloseTo(6);
    expect(terms.forCorrection).toBeCloseTo(1);
    expect(terms.total).toBeCloseTo(7);
  });

  it('rechaza un ratio no positivo', () => {
    expect(
      insulinParamsSchema.safeParse({
        ratio: 0,
        correctionFactor: 50,
        target: 100,
        current: 100,
        carbs: 0,
      }).success,
    ).toBe(false);
  });
});
