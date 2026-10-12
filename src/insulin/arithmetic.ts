import { z } from 'zod';

export const insulinParamsSchema = z.object({
  ratio: z.number().positive(),
  correctionFactor: z.number().positive(),
  target: z.number().nonnegative(),
  current: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
});

export type InsulinParams = z.infer<typeof insulinParamsSchema>;

export function bolusArithmetic(params: InsulinParams): number {
  const forMeal = params.carbs / params.ratio;
  const forCorrection = (params.current - params.target) / params.correctionFactor;
  const total = forMeal + forCorrection;
  return Math.max(0, Math.round(total * 100) / 100);
}

export function arithmeticTerms(params: InsulinParams): {
  forMeal: number;
  forCorrection: number;
  total: number;
} {
  const forMeal = params.carbs / params.ratio;
  const forCorrection = (params.current - params.target) / params.correctionFactor;
  return {
    forMeal: Math.round(forMeal * 100) / 100,
    forCorrection: Math.round(forCorrection * 100) / 100,
    total: bolusArithmetic(params),
  };
}
