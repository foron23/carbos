import { z } from 'zod';

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'sha256 esperado en hex minusculas');

const urlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'url absoluta o ruta relativa esperada' },
  );

export const modelEntrySchema = z.object({
  version: z.string().min(1),
  url: urlSchema,
  sha256: sha256Schema,
  bytes: z.number().int().positive(),
});

export const classifierEntrySchema = modelEntrySchema.extend({
  classes: z.array(z.string().min(1)).min(1),
});

export const modelManifestSchema = z.object({
  detector: modelEntrySchema,
  classifier: classifierEntrySchema,
});

export type ModelEntry = z.infer<typeof modelEntrySchema>;
export type ClassifierEntry = z.infer<typeof classifierEntrySchema>;
export type ModelManifest = z.infer<typeof modelManifestSchema>;
