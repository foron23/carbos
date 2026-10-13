import { z } from 'zod';

/**
 * Esquema cerrado de intenciones del chat on-device (Fase 3 / v1.1).
 *
 * Contrato (ver `docs/specs/14-chat.md`): el chat **propone, nunca ejecuta** y **nunca
 * produce unidades de insulina**. No existe `compute_insulin` ni ningun campo que
 * relacione carbohidratos con unidades; esa ausencia es la linea regulatoria.
 *
 * Todos los objetos son `.strict()`: una clave extra invalida la intencion entera y el
 * parser degrada a `{ action: 'unknown' }`.
 */

/** Maximo de gramos por item. Fuera de rango invalida la intencion (no se recorta). */
export const MAX_MEAL_GRAMS = 2000;

/** Maximo de unidades por registro. Guarda anti-alucinacion, no criterio clinico. */
export const MAX_INSULIN_UNITS = 100;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha esperada YYYY-MM-DD');
const hhmmSchema = z.string().regex(/^\d{2}:\d{2}$/, 'hora esperada HH:MM');

const mealItemSchema = z
  .object({
    query: z.string().trim().min(1),
    grams: z.number().gt(0).max(MAX_MEAL_GRAMS).optional(),
  })
  .strict();

const logMealSchema = z
  .object({
    action: z.literal('log_meal'),
    date: isoDateSchema.optional(),
    time: hhmmSchema.optional(),
    items: z.array(mealItemSchema).min(1),
  })
  .strict();

const logInsulinSchema = z
  .object({
    action: z.literal('log_insulin'),
    date: isoDateSchema.optional(),
    time: hhmmSchema.optional(),
    units: z.number().gt(0).max(MAX_INSULIN_UNITS),
    kind: z.enum(['bolus', 'basal']).optional(),
  })
  .strict();

const queryTotalsSchema = z
  .object({
    action: z.literal('query_totals'),
    date: isoDateSchema.optional(),
  })
  .strict();

const setDateSchema = z
  .object({
    action: z.literal('set_date'),
    date: isoDateSchema,
  })
  .strict();

const unknownSchema = z.object({ action: z.literal('unknown') }).strict();

export const chatIntentSchema = z.discriminatedUnion('action', [
  logMealSchema,
  logInsulinSchema,
  queryTotalsSchema,
  setDateSchema,
  unknownSchema,
]);

export type ChatIntent = z.infer<typeof chatIntentSchema>;

/** Valida una intencion cruda; ante cualquier fallo devuelve `{ action: 'unknown' }`. */
export function parseIntent(raw: unknown): ChatIntent {
  const result = chatIntentSchema.safeParse(raw);
  return result.success ? result.data : { action: 'unknown' };
}
