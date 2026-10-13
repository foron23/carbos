import { putAll, tx } from '../core/db';
import type { ScannedProduct } from './types';

/** Store IndexedDB del overlay; creado por el bump de DB_VERSION del modulo de integracion. */
const STORE = 'products';

/** Filas por transaccion: un pack de pais no debe abrir una transaccion gigante. */
const IMPORT_BATCH = 1000;

export function getProduct(barcode: string): Promise<ScannedProduct | null> {
  return tx<ScannedProduct | undefined>(STORE, 'readonly', (store) => store.get(barcode)).then(
    (product) => product ?? null,
  );
}

export function putProduct(product: ScannedProduct): Promise<void> {
  return tx(STORE, 'readwrite', (store) => store.put(product)).then(() => undefined);
}

export async function putProducts(list: ScannedProduct[]): Promise<number> {
  for (let start = 0; start < list.length; start += IMPORT_BATCH) {
    await putAll(STORE, list.slice(start, start + IMPORT_BATCH));
  }
  return list.length;
}

export function countProducts(): Promise<number> {
  return tx<number>(STORE, 'readonly', (store) => store.count());
}

export function clearProducts(): Promise<void> {
  return tx(STORE, 'readwrite', (store) => store.clear()).then(() => undefined);
}
