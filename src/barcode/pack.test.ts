import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScannedProduct } from './types';

const mocks = vi.hoisted(() => ({
  putProducts: vi.fn<(list: ScannedProduct[]) => Promise<number>>(async (list) => list.length),
}));

vi.mock('./store', () => ({ putProducts: mocks.putProducts }));

import { importPack, parseManifest, sha256Hex, verifySha256 } from './pack';
import type { BarcodePackManifest } from './types';

async function gzipText(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function jsonl(products: unknown[]): string {
  return products.map((product) => JSON.stringify(product)).join('\n');
}

async function manifestFor(bytes: ArrayBuffer, productCount: number): Promise<BarcodePackManifest> {
  return {
    format: 'carbos-barcode-pack',
    version: 1,
    locale: 'es',
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    product_count: productCount,
    generated_at: '2026-01-01T00:00:00.000Z',
  };
}

const SAMPLE = [
  {
    barcode: '036000291452',
    name: { es: 'Pan', en: 'Bread' },
    carbsPer100g: 58.3,
    brand: 'Marca',
    source: 'pack',
    savedAt: 1,
  },
  { barcode: '4006381333931', name: 'Crema', carbsPer100g: 57.5 },
];

beforeEach(() => {
  mocks.putProducts.mockClear();
});

describe('parseManifest', () => {
  it('acepta un manifest valido', () => {
    const manifest = parseManifest({
      format: 'carbos-barcode-pack',
      version: 1,
      locale: 'es',
      bytes: 10,
      sha256: 'a'.repeat(64),
      product_count: 2,
      generated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(manifest.locale).toBe('es');
    expect(manifest.product_count).toBe(2);
  });

  it('rechaza un manifest invalido', () => {
    expect(() => parseManifest({ format: 'otro' })).toThrow();
    expect(() => parseManifest({ format: 'carbos-barcode-pack', version: 2 })).toThrow();
  });
});

describe('sha256', () => {
  it('calcula y verifica el sha256', async () => {
    const bytes = await new Blob(['carbos']).arrayBuffer();
    const hex = await sha256Hex(bytes);
    expect(hex).toMatch(/^[a-f0-9]{64}$/);
    expect(await verifySha256(bytes, hex.toUpperCase())).toBe(true);
    expect(await verifySha256(bytes, '0'.repeat(64))).toBe(false);
  });
});

describe('importPack', () => {
  it('verifica el sha256 e importa el JSONL gzip normalizando barcodes', async () => {
    const bytes = await gzipText(jsonl(SAMPLE));
    const manifest = await manifestFor(bytes, SAMPLE.length);

    const result = await importPack({ manifest, blob: new Blob([bytes]) });

    expect(result.imported).toBe(2);
    expect(mocks.putProducts).toHaveBeenCalledTimes(1);
    const inserted = mocks.putProducts.mock.calls[0]?.[0] ?? [];
    expect(inserted[0]).toMatchObject({ barcode: '0036000291452', brand: 'Marca' });
    expect(inserted[1]).toMatchObject({ barcode: '4006381333931', source: 'pack' });
    expect(inserted[1]?.savedAt).toEqual(expect.any(Number));
  });

  it('acepta JSONL sin comprimir', async () => {
    const bytes = await new Blob([jsonl(SAMPLE)]).arrayBuffer();
    const manifest = await manifestFor(bytes, SAMPLE.length);

    expect(await importPack({ manifest, blob: new Blob([bytes]) })).toEqual({ imported: 2 });
  });

  it('rechaza un sha256 que no coincide', async () => {
    const bytes = await gzipText(jsonl(SAMPLE));
    const manifest = { ...(await manifestFor(bytes, SAMPLE.length)), sha256: '0'.repeat(64) };

    await expect(importPack({ manifest, blob: new Blob([bytes]) })).rejects.toThrow(/sha256/);
    expect(mocks.putProducts).not.toHaveBeenCalled();
  });

  it('falla con JSONL malformado', async () => {
    const bytes = await gzipText('{ no-es-json');
    const manifest = await manifestFor(bytes, 1);

    await expect(importPack({ manifest, blob: new Blob([bytes]) })).rejects.toThrow();
  });

  it('rechaza un barcode invalido dentro del pack', async () => {
    const bytes = await gzipText(jsonl([{ barcode: '123', name: 'x', carbsPer100g: 1 }]));
    const manifest = await manifestFor(bytes, 1);

    await expect(importPack({ manifest, blob: new Blob([bytes]) })).rejects.toThrow(/barcode/);
  });

  it('falla con un gzip corrupto', async () => {
    const bytes = await new Blob([new Uint8Array([0x1f, 0x8b, 0x00, 0x00])]).arrayBuffer();
    const manifest = await manifestFor(bytes, 1);

    await expect(importPack({ manifest, blob: new Blob([bytes]) })).rejects.toThrow();
  });

  it('acepta un producto sin carbohidratos (pack resto)', async () => {
    const rest = [{ barcode: '4006381333931', name: 'Solo nombre', brand: 'Marca' }];
    const bytes = await gzipText(jsonl(rest));
    const manifest = await manifestFor(bytes, rest.length);

    expect(await importPack({ manifest, blob: new Blob([bytes]) })).toEqual({ imported: 1 });
    const inserted = mocks.putProducts.mock.calls[0]?.[0] ?? [];
    expect(inserted[0]).toMatchObject({ barcode: '4006381333931', source: 'pack' });
    expect(inserted[0]?.carbsPer100g).toBeUndefined();
  });
});
