import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScannedProduct } from './types';

interface MemoryStore {
  put(record: ScannedProduct): ScannedProduct;
  get(id: string): ScannedProduct | undefined;
  getAll(): ScannedProduct[];
  count(): number;
  delete(id: string): void;
  clear(): void;
}

const mocks = vi.hoisted(() => {
  const stores = new Map<string, Map<string, ScannedProduct>>();
  const storeFor = (name: string): MemoryStore => {
    let map = stores.get(name);
    if (!map) {
      map = new Map<string, ScannedProduct>();
      stores.set(name, map);
    }
    const inner = map;
    return {
      put: (record) => {
        inner.set(record.barcode, record);
        return record;
      },
      get: (id) => inner.get(id),
      getAll: () => [...inner.values()],
      count: () => inner.size,
      delete: (id) => {
        inner.delete(id);
      },
      clear: () => {
        inner.clear();
      },
    };
  };
  const tx = vi.fn(
    async (
      storeName: string,
      _mode: string,
      run: (store: MemoryStore) => unknown,
    ): Promise<unknown> => run(storeFor(storeName)),
  );
  const putAll = vi.fn(async (storeName: string, items: ScannedProduct[]): Promise<void> => {
    const store = storeFor(storeName);
    for (const item of items) store.put(item);
  });
  return { stores, tx, putAll };
});

vi.mock('../core/db', () => ({ tx: mocks.tx, putAll: mocks.putAll }));

import { clearProducts, countProducts, getProduct, putProduct, putProducts } from './store';

function product(barcode: string): ScannedProduct {
  return { barcode, name: 'producto', carbsPer100g: 10, source: 'test', savedAt: 0 };
}

beforeEach(() => {
  mocks.stores.clear();
  mocks.tx.mockClear();
  mocks.putAll.mockClear();
});

describe('getProduct', () => {
  it('devuelve null si el codigo no esta en el store', async () => {
    expect(await getProduct('4006381333931')).toBeNull();
  });

  it('devuelve el producto guardado por barcode', async () => {
    await putProduct(product('4006381333931'));
    await expect(getProduct('4006381333931')).resolves.toMatchObject({
      barcode: '4006381333931',
      carbsPer100g: 10,
    });
  });
});

describe('putProducts', () => {
  it('guarda todos los productos y devuelve cuantos inserto', async () => {
    const inserted = await putProducts([product('4006381333931'), product('0036000291452')]);
    expect(inserted).toBe(2);
    expect(await countProducts()).toBe(2);
  });

  it('con una lista vacia no inserta nada', async () => {
    expect(await putProducts([])).toBe(0);
    expect(await countProducts()).toBe(0);
  });
});

describe('clearProducts', () => {
  it('vacia el store', async () => {
    await putProducts([product('4006381333931')]);
    await clearProducts();
    expect(await countProducts()).toBe(0);
  });
});
