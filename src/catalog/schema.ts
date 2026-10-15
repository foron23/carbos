import { z } from 'zod';
import { CATALOG_VERSION } from './types';

export const foodNameSchema = z.object({
  es: z.string().min(1),
  en: z.string().min(1),
});

export const carbsRangeSchema = z
  .tuple([z.number().nonnegative(), z.number().nonnegative()])
  .refine(([min, max]) => min <= max, {
    message: 'carbsRange debe cumplir min <= max',
  });

export const foodSchema = z.object({
  id: z.string().min(1),
  name: foodNameSchema,
  synonyms: z.array(z.string().min(1)),
  carbsPer100g: z.number().nonnegative(),
  carbsRange: carbsRangeSchema.optional(),
  // Macros y energia opcionales (SPEC 26 / D68): numeros no negativos; la kcal
  // derivada se marca con kcalDerived.
  proteinPer100g: z.number().nonnegative().optional(),
  fatPer100g: z.number().nonnegative().optional(),
  kcalPer100g: z.number().nonnegative().optional(),
  kcalDerived: z.boolean().optional(),
  fiberPer100g: z.number().nonnegative().optional(),
  sugarsPer100g: z.number().nonnegative().optional(),
  defaultPortionGrams: z.number().positive(),
  source: z.string().min(1),
});

export const catalogSchema = z.object({
  version: z.literal(CATALOG_VERSION),
  foods: z.array(foodSchema),
});

export type CatalogInput = z.input<typeof catalogSchema>;
