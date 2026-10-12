import { z } from 'zod';
import { CATALOG_VERSION } from './types';

export const foodNameSchema = z.object({
  es: z.string().min(1),
  en: z.string().min(1),
});

export const foodSchema = z.object({
  id: z.string().min(1),
  name: foodNameSchema,
  synonyms: z.array(z.string().min(1)),
  carbsPer100g: z.number().nonnegative(),
  defaultPortionGrams: z.number().positive(),
  source: z.string().min(1),
});

export const catalogSchema = z.object({
  version: z.literal(CATALOG_VERSION),
  foods: z.array(foodSchema),
});

export type CatalogInput = z.input<typeof catalogSchema>;
