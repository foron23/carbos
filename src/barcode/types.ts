/**
 * Tipos del modulo de codigo de barras (Fase A, offline).
 *
 * Overlay de productos escaneados, separado del catalogo curado (D26/D19): vive en
 * su propio store IndexedDB `products` y no toca `catalog.ts`. Sin bump de esquema.
 */

export interface ScannedProduct {
  barcode: string;
  name: { es: string; en: string } | string;
  brand?: string;
  /** Carbohidratos por 100 g; ausente en los packs de solo identificacion. */
  carbsPer100g?: number;
  defaultPortionGrams?: number;
  source: string;
  savedAt: number;
}

export interface BarcodePackManifest {
  format: 'carbos-barcode-pack';
  version: 1;
  locale: string;
  url?: string;
  bytes: number;
  sha256: string;
  /** sha256 de los bytes del JSONL ya decodificado (lo que se parsea e importa). */
  sha256_raw?: string;
  /** Longitud en bytes del JSONL decodificado. */
  raw_bytes?: number;
  product_count: number;
  generated_at: string;
}

export type BarcodeResolution =
  { kind: 'hit'; product: ScannedProduct } | { kind: 'miss' } | { kind: 'invalid' };
