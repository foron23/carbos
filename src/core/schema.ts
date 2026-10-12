import { z } from 'zod';
import { SCHEMA_VERSION } from './types';

export const mealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const insulinKindSchema = z.enum(['bolus', 'basal']);

export const foodItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  grams: z.number().nonnegative(),
  carbsPer100g: z.number().nonnegative(),
});

export const mealSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha esperada YYYY-MM-DD'),
  slot: mealSlotSchema,
  items: z.array(foodItemSchema),
  confidence: z.number().min(0).max(1).nullable(),
});

export const insulinLogSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha esperada YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'hora esperada HH:MM'),
  units: z.number().nonnegative(),
  kind: insulinKindSchema,
});

export const vaultSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  meals: z.array(mealSchema),
  insulin: z.array(insulinLogSchema),
});

export type VaultInput = z.input<typeof vaultSchema>;
