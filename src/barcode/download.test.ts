import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScannedProduct } from './types';

interface MemoryStore {
  put(record: ScannedProduct): ScannedProduct;
  get(id: string): ScannedProduct | undefined;
  getAll(): ScannedProduct[];
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

import { downloadPack, fetchPacksManifest, parsePacksManifest } from './download';
import type { PackEntry } from './download';
import { sha256Hex } from './pack';

async function gzipText(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function jsonl(products: unknown[]): string {
  return products.map((product) => JSON.stringify(product)).join('\n');
}

function entryWith(overrides: Partial<PackEntry> = {}): PackEntry {
  return {
    id: 'es',
    locale: 'es',
    url: 'https://cdn.example.com/es.jsonl.gz',
    sha256: 'a'.repeat(64),
    bytes: 1234,
    product_count: 1,
    generated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const SAMPLE = [
  { barcode: '036000291452', name: { es: 'Pan', en: 'Bread' }, carbsPer100g: 58.3 },
  { barcode: '4006381333931', name: 'Crema', carbsPer100g: 57.5 },
];

beforeEach(() => {
  mocks.stores.clear();
  mocks.tx.mockClear();
  mocks.putAll.mockClear();
});

describe('parsePacksManifest', () => {
  it('acepta un manifest de packs valido', () => {
    const manifest = parsePacksManifest({
      format: 'carbos-barcode-packs',
      version: 1,
      packs: [entryWith()],
    });
    expect(manifest.packs).toHaveLength(1);
    expect(manifest.packs[0]?.locale).toBe('es');
  });

  it('acepta una lista de packs vacia', () => {
    expect(
      parsePacksManifest({ format: 'carbos-barcode-packs', version: 1, packs: [] }).packs,
    ).toEqual([]);
  });

  it('rechaza formatos o entradas invalidas', () => {
    expect(() => parsePacksManifest({ format: 'otro', version: 1, packs: [] })).toThrow();
    expect(() => parsePacksManifest({ format: 'carbos-barcode-packs', version: 2 })).toThrow();
    expect(() =>
      parsePacksManifest({
        format: 'carbos-barcode-packs',
        version: 1,
        packs: [{ id: 'es' }],
      }),
    ).toThrow();
  });
});

describe('fetchPacksManifest', () => {
  it('descarga y valida el manifest con el fetcher inyectado', async () => {
    const fetcher = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({
        format: 'carbos-barcode-packs',
        version: 1,
        packs: [entryWith()],
      }),
    );

    const manifest = await fetchPacksManifest(
      'https://cdn.example.com/barcode-manifest.json',
      fetcher,
    );

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://cdn.example.com/barcode-manifest.json');
    expect(manifest.packs[0]?.id).toBe('es');
  });

  it('lanza si la respuesta no es ok', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 500 }));
    await expect(fetchPacksManifest('https://cdn.example.com/m.json', fetcher)).rejects.toThrow();
  });
});

describe('downloadPack', () => {
  it('verifica el sha256, reporta progreso e importa los productos', async () => {
    const bytes = await gzipText(jsonl(SAMPLE));
    const entry = entryWith({
      sha256: await sha256Hex(bytes),
      bytes: bytes.byteLength,
      product_count: 2,
    });
    const fetcher = vi.fn(
      async () => new Response(bytes, { headers: { 'content-length': String(bytes.byteLength) } }),
    );
    const progress: { loaded: number; total: number }[] = [];

    const result = await downloadPack(entry, { fetcher, onProgress: (p) => progress.push(p) });

    expect(result).toEqual({ imported: 2 });
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toEqual({ loaded: bytes.byteLength, total: bytes.byteLength });
    expect(mocks.putAll).toHaveBeenCalledTimes(1);
    const inserted = mocks.putAll.mock.calls[0]?.[1] ?? [];
    expect(inserted[0]).toMatchObject({ barcode: '0036000291452' });
  });

  it('falla si el sha256 no coincide y no importa nada', async () => {
    const bytes = await gzipText(jsonl(SAMPLE));
    const entry = entryWith({ sha256: '0'.repeat(64), bytes: bytes.byteLength, product_count: 2 });
    const fetcher = vi.fn(async () => new Response(bytes));

    await expect(downloadPack(entry, { fetcher })).rejects.toThrow(/sha256/);
    expect(mocks.putAll).not.toHaveBeenCalled();
  });

  it('lanza si la descarga no es ok', async () => {
    const fetcher = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(downloadPack(entryWith(), { fetcher })).rejects.toThrow(/descarga 404/);
  });
});
