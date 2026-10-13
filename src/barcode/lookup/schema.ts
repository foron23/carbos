import { z } from 'zod';

/**
 * Esquema (subconjunto) de la respuesta de Open Food Facts v3.
 *
 * Solo se declaran los campos que la app usa; zod descarta el resto. Se admite
 * `null` (OFF lo devuelve para campos ausentes) y se acepta `carbohydrates_100g`
 * o `serving_quantity` como numero o cadena, para no reventar ante variaciones.
 */

const numberLikeSchema = z.union([z.number(), z.string()]);

export const offProductSchema = z.object({
  code: z.string().nullish(),
  product_name: z.string().nullish(),
  product_name_es: z.string().nullish(),
  product_name_en: z.string().nullish(),
  brands: z.string().nullish(),
  serving_quantity: numberLikeSchema.nullish(),
  nutrition_data_per: z.string().nullish(),
  nutriments: z
    .object({
      carbohydrates_100g: numberLikeSchema.nullish(),
    })
    .nullish(),
});

export const offResponseSchema = z.object({
  status: z.string().nullish(),
  product: offProductSchema.nullish(),
});

export type OffProduct = z.infer<typeof offProductSchema>;
export type OffResponse = z.infer<typeof offResponseSchema>;
