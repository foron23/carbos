import { z } from 'zod';
import { normalizeEan } from './ean';
import { putProducts } from './store';
import type { BarcodePackManifest, ScannedProduct } from './types';

/**
 * Pack descargable (Opcion E): JSONL comprimido en gzip + manifest con sha256.
 * `importPack` verifica la firma, descomprime (si procede), valida cada linea y
 * vuelca el resultado en el store `products`. Sin red: el `blob` ya viene del usuario.
 */

export const barcodePackManifestSchema = z.object({
  format: z.literal('carbos-barcode-pack'),
  version: z.literal(1),
  locale: z.string().min(1),
  url: z.string().min(1).optional(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sha256_raw: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  raw_bytes: z.number().int().nonnegative().optional(),
  product_count: z.number().int().nonnegative(),
  generated_at: z.string().min(1),
});

export function parseManifest(json: unknown): BarcodePackManifest {
  // Zod infiere `url?: string | undefined`; el contrato congelado no admite `undefined`.
  return barcodePackManifestSchema.parse(json) as BarcodePackManifest;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export async function verifySha256(bytes: ArrayBuffer, expected: string): Promise<boolean> {
  return (await sha256Hex(bytes)) === expected.toLowerCase();
}

const productLineSchema = z.object({
  barcode: z.string(),
  // Los packs reales pueden traer un idioma vacio (nunca ambos): se tolera en el
  // esquema y se normaliza en `toProduct`.
  name: z.union([z.string().min(1), z.object({ es: z.string(), en: z.string() })]),
  brand: z.string().min(1).optional(),
  // Opcional: los packs de solo identificacion no traen carbohidratos.
  carbsPer100g: z.number().nonnegative().optional(),
  defaultPortionGrams: z.number().positive().optional(),
  source: z.string().min(1).optional(),
  savedAt: z.number().optional(),
});

function normalizeName(name: string | { es: string; en: string }): ScannedProduct['name'] {
  if (typeof name === 'string') return name;
  const es = name.es || name.en;
  const en = name.en || name.es;
  if (!es || !en) throw new Error('name vacio en ambos idiomas');
  return { es, en };
}

function toProduct(line: unknown): ScannedProduct {
  const raw = productLineSchema.parse(line);
  const barcode = normalizeEan(raw.barcode);
  if (!barcode) throw new Error(`barcode invalido en el pack: ${raw.barcode}`);
  const product: ScannedProduct = {
    barcode,
    name: normalizeName(raw.name),
    source: raw.source ?? 'pack',
    savedAt: raw.savedAt ?? Date.now(),
  };
  if (raw.carbsPer100g !== undefined) product.carbsPer100g = raw.carbsPer100g;
  if (raw.brand !== undefined) product.brand = raw.brand;
  if (raw.defaultPortionGrams !== undefined) product.defaultPortionGrams = raw.defaultPortionGrams;
  return product;
}

function parseProducts(text: string): ScannedProduct[] {
  const products: ScannedProduct[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Import tolerante: una linea invalida no aborta el pack entero, se salta.
    try {
      products.push(toProduct(JSON.parse(trimmed)));
    } catch {
      continue;
    }
  }
  return products;
}

function isGzip(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  return head.length === 2 && head[0] === 0x1f && head[1] === 0x8b;
}

async function gunzipBytes(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('DecompressionStream no disponible');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function importPack(input: {
  manifest: BarcodePackManifest;
  blob: Blob;
}): Promise<{ imported: number }> {
  const bytes = await input.blob.arrayBuffer();
  const compressed = isGzip(bytes);
  // 1) Si el transporte no descomprimio, los bytes son el .gz publicado: se
  //    verifica el sha256 comprimido y se descomprime a bytes.
  // 2) Si ya vienen descomprimidos (Content-Encoding: gzip), se usan tal cual.
  let plain: ArrayBuffer = bytes;
  if (compressed) {
    if (!(await verifySha256(bytes, input.manifest.sha256))) {
      throw new Error('sha256 no coincide con el manifest');
    }
    plain = await gunzipBytes(bytes);
  }
  // 3) Integridad del JSONL decodificado contra sha256_raw (si esta).
  if (input.manifest.sha256_raw !== undefined) {
    if (!(await verifySha256(plain, input.manifest.sha256_raw))) {
      throw new Error('sha256_raw no coincide con el manifest');
    }
  } else if (!compressed) {
    throw new Error('no se puede verificar: falta sha256_raw y los bytes no son gzip');
  }
  const products = parseProducts(new TextDecoder().decode(plain));
  const imported = await putProducts(products);
  return { imported };
}
