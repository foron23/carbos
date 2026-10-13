import { z } from 'zod';
import { modelEntrySchema } from '../model/manifest';

/**
 * Manifest propio del chat (`public/chat-manifest.json`), **separado** de
 * `public/model-manifest.json` para no tocar el contrato de foto.
 *
 * Reutiliza `modelEntrySchema` de `src/model/manifest.ts` (version, url, sha256, bytes) para
 * cada pieza; `modelManifestSchema` queda intacto. Sin este manifest el chat se oculta: no hay
 * UI de error.
 */
export const chatManifestSchema = z.object({
  model: modelEntrySchema,
  tokenizer: modelEntrySchema,
});

export type ChatManifest = z.infer<typeof chatManifestSchema>;
