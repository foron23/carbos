import { z } from 'zod';
import type { BarcodeFetcher } from './lookup/client';
import { importPack, verifySha256 } from './pack';
import type { BarcodePackManifest } from './types';

/**
 * Descarga automatizada de packs (Fase A/E): manifest hospedado -> entrada ->
 * descarga con progreso -> verificacion sha256 -> importacion en IndexedDB.
 *
 * Es red explicita (accion del usuario "descargar pack"), nunca parte de la
 * resolucion de un codigo; tras importar, el escaneo vuelve a ser local.
 */

export interface PackEntry {
  id: string;
  locale: string;
  url: string;
  sha256: string;
  bytes: number;
  product_count: number;
  generated_at: string;
}

export interface BarcodePacksManifest {
  format: 'carbos-barcode-packs';
  version: 1;
  packs: PackEntry[];
}

const packEntrySchema = z.object({
  id: z.string().min(1),
  locale: z.string().min(1),
  url: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  product_count: z.number().int().nonnegative(),
  generated_at: z.string().min(1),
});

export const barcodePacksManifestSchema = z.object({
  format: z.literal('carbos-barcode-packs'),
  version: z.literal(1),
  packs: z.array(packEntrySchema),
});

export function parsePacksManifest(json: unknown): BarcodePacksManifest {
  return barcodePacksManifestSchema.parse(json) as BarcodePacksManifest;
}

/** Descarga y valida el manifest hospedado que lista los packs disponibles. */
export async function fetchPacksManifest(
  url: string,
  fetcher: BarcodeFetcher = fetch,
): Promise<BarcodePacksManifest> {
  const response = await fetcher(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`manifest ${response.status}`);
  return parsePacksManifest(await response.json());
}

async function fetchPackBytes(
  url: string,
  fetcher: BarcodeFetcher,
  onProgress: (progress: { loaded: number; total: number }) => void,
  fallbackTotal: number,
): Promise<ArrayBuffer> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`descarga ${response.status}`);
  const total = Number(response.headers.get('content-length') ?? 0) || fallbackTotal;
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress({ loaded, total });
    }
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

/**
 * Descarga un pack con progreso, verifica su sha256 y lo importa en el store
 * local. Lanza si la descarga falla o si el sha256 no coincide (pack alterado).
 */
export async function downloadPack(
  entry: PackEntry,
  opts: {
    onProgress?: (progress: { loaded: number; total: number }) => void;
    fetcher?: BarcodeFetcher;
  } = {},
): Promise<{ imported: number }> {
  const fetcher = opts.fetcher ?? fetch;
  const bytes = await fetchPackBytes(
    entry.url,
    fetcher,
    opts.onProgress ?? (() => {}),
    entry.bytes,
  );
  if (!(await verifySha256(bytes, entry.sha256))) {
    throw new Error('sha256 no coincide con el manifest');
  }
  const manifest: BarcodePackManifest = {
    format: 'carbos-barcode-pack',
    version: 1,
    locale: entry.locale,
    url: entry.url,
    bytes: entry.bytes,
    sha256: entry.sha256,
    product_count: entry.product_count,
    generated_at: entry.generated_at,
  };
  return importPack({ manifest, blob: new Blob([bytes]) });
}
