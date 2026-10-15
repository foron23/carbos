import { z } from 'zod';
import { SCHEMA_VERSION } from './types';

export const mealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'hora esperada HH:MM');
export const mealOriginSchema = z.enum(['manual', 'photo']);
export const insulinKindSchema = z.enum(['bolus', 'basal']);

export const topkSchema = z.object({
  classId: z.string().min(1),
  p: z.number().min(0).max(1),
});

export const modelMetaSchema = z.object({
  detector: z.string().min(1),
  classifier: z.string().min(1),
  topk: z.array(topkSchema),
});

export const foodItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  grams: z.number().nonnegative(),
  carbsPer100g: z.number().nonnegative(),
  classId: z.string().min(1).optional(),
  barcode: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
});

export const mealSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha esperada YYYY-MM-DD'),
  time: timeSchema,
  items: z.array(foodItemSchema),
  confidence: z.number().min(0).max(1).nullable(),
  origin: mealOriginSchema.default('manual'),
  model: modelMetaSchema.optional(),
});

export const insulinLogSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha esperada YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'hora esperada HH:MM'),
  units: z.number().nonnegative(),
  kind: insulinKindSchema,
});

export const mealGroupSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha esperada YYYY-MM-DD'),
  name: z.string().min(1).optional(),
  mealIds: z.array(z.string().min(1)),
});

export const vaultSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  meals: z.array(mealSchema),
  insulin: z.array(insulinLogSchema),
  groups: z.array(mealGroupSchema).optional(),
});

export type VaultInput = z.input<typeof vaultSchema>;
