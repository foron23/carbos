import { normalizeEan } from './ean';
import { lookupOnline } from './lookup/client';
import type { BarcodeFetcher } from './lookup/client';
import { getProduct, putProduct } from './store';
import type { BarcodeResolution } from './types';

/**
 * Resolucion local-first: normaliza el codigo, lo busca en el store `products` y
 * devuelve hit/miss. Un codigo invalido no toca la base de datos.
 *
 * Con `opts.online` activado, un miss local consulta Open Food Facts (Fase B) y,
 * si hay producto, lo cachea y devuelve hit. Sin ese flag no hay red en absoluto.
 * Nunca lanza: cualquier fallo de la consulta o del cache cae a miss.
 */
export async function resolveBarcode(
  barcode: string,
  opts: { online?: boolean; fetcher?: BarcodeFetcher } = {},
): Promise<BarcodeResolution> {
  const normalized = normalizeEan(barcode);
  if (!normalized) return { kind: 'invalid' };
  const local = await getProduct(normalized);
  if (local) return { kind: 'hit', product: local };
  if (!opts.online) return { kind: 'miss' };
  try {
    const product = await lookupOnline(
      normalized,
      opts.fetcher ? { fetcher: opts.fetcher } : undefined,
    );
    if (!product) return { kind: 'miss' };
    await putProduct(product);
    return { kind: 'hit', product };
  } catch {
    return { kind: 'miss' };
  }
}
