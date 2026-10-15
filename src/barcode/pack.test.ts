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

async function manifestFor(
  bytes: ArrayBuffer,
  productCount: number,
  extra: Partial<BarcodePackManifest> = {},
): Promise<BarcodePackManifest> {
  return {
    format: 'carbos-barcode-pack',
    version: 1,
    locale: 'es',
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    product_count: productCount,
    generated_at: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

async function plainBytes(products: unknown[]): Promise<ArrayBuffer> {
  return new Blob([jsonl(products)]).arrayBuffer();
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

  it('importa JSONL ya descomprimido cuando el manifest trae sha256_raw', async () => {
    // Simula Content-Encoding: gzip: el transporte ya descomprimio, asi que el
    // blob recibido es el JSONL crudo aunque el manifest describe el .gz.
    const plain = await plainBytes(SAMPLE);
    const compressed = await gzipText(jsonl(SAMPLE));
    const manifest = await manifestFor(compressed, SAMPLE.length, {
      sha256_raw: await sha256Hex(plain),
      raw_bytes: plain.byteLength,
    });

    expect(await importPack({ manifest, blob: new Blob([plain]) })).toEqual({ imported: 2 });
  });

  it('rechaza JSONL descomprimido manipulado contra sha256_raw', async () => {
    const plain = await plainBytes(SAMPLE);
    const compressed = await gzipText(jsonl(SAMPLE));
    const manifest = await manifestFor(compressed, SAMPLE.length, {
      sha256_raw: await sha256Hex(plain),
      raw_bytes: plain.byteLength,
    });
    const tampered = await plainBytes([...SAMPLE, { barcode: '4006381333931', name: 'Extra' }]);

    await expect(importPack({ manifest, blob: new Blob([tampered]) })).rejects.toThrow(/sha256/);
    expect(mocks.putProducts).not.toHaveBeenCalled();
  });

  it('verifica sha256 comprimido y sha256_raw de un gzip valido', async () => {
    const plain = await plainBytes(SAMPLE);
    const compressed = await gzipText(jsonl(SAMPLE));
    const manifest = await manifestFor(compressed, SAMPLE.length, {
      sha256_raw: await sha256Hex(plain),
      raw_bytes: plain.byteLength,
    });

    expect(await importPack({ manifest, blob: new Blob([compressed]) })).toEqual({ imported: 2 });
  });

  it('rechaza bytes sin gzip y sin sha256_raw (no se puede verificar)', async () => {
    const plain = await plainBytes(SAMPLE);
    const manifest = await manifestFor(plain, SAMPLE.length);

    await expect(importPack({ manifest, blob: new Blob([plain]) })).rejects.toThrow(/sha256_raw/);
    expect(mocks.putProducts).not.toHaveBeenCalled();
  });

  it('rechaza un sha256 que no coincide', async () => {
    const bytes = await gzipText(jsonl(SAMPLE));
    const manifest = { ...(await manifestFor(bytes, SAMPLE.length)), sha256: '0'.repeat(64) };

    await expect(importPack({ manifest, blob: new Blob([bytes]) })).rejects.toThrow(/sha256/);
    expect(mocks.putProducts).not.toHaveBeenCalled();
  });

  it('ignora lineas malformadas y no aborta el pack', async () => {
    const text = `${jsonl([SAMPLE[1]])}\n{ no-es-json`;
    const bytes = await gzipText(text);
    const manifest = await manifestFor(bytes, 2);

    expect(await importPack({ manifest, blob: new Blob([bytes]) })).toEqual({ imported: 1 });
  });

  it('salta un barcode invalido y conserva el valido', async () => {
    const products = [
      { barcode: '123', name: 'x', carbsPer100g: 1 },
      { barcode: '4006381333931', name: 'Crema', carbsPer100g: 57.5 },
    ];
    const bytes = await gzipText(jsonl(products));
    const manifest = await manifestFor(bytes, products.length);

    expect(await importPack({ manifest, blob: new Blob([bytes]) })).toEqual({ imported: 1 });
    const inserted = mocks.putProducts.mock.calls[0]?.[0] ?? [];
    expect(inserted[0]).toMatchObject({ barcode: '4006381333931' });
  });

  it('importa solo la valida cuando otra linea tiene el nombre vacio en ambos idiomas', async () => {
    const products = [
      { barcode: '4006381333931', name: { es: '', en: '' } },
      { barcode: '8412345678905', name: 'Valida', carbsPer100g: 10 },
    ];
    const bytes = await gzipText(jsonl(products));
    const manifest = await manifestFor(bytes, products.length);

    expect(await importPack({ manifest, blob: new Blob([bytes]) })).toEqual({ imported: 1 });
    const inserted = mocks.putProducts.mock.calls[0]?.[0] ?? [];
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ barcode: '8412345678905' });
  });

  it('normaliza un nombre con un idioma vacio al otro (simetrico)', async () => {
    const products = [
      { barcode: '4006381333931', name: { es: '', en: 'Leche' } },
      { barcode: '8412345678905', name: { es: 'Leche', en: '' } },
    ];
    const bytes = await gzipText(jsonl(products));
    const manifest = await manifestFor(bytes, products.length);

    expect(await importPack({ manifest, blob: new Blob([bytes]) })).toEqual({ imported: 2 });
    const inserted = mocks.putProducts.mock.calls[0]?.[0] ?? [];
    expect(inserted[0]?.name).toEqual({ es: 'Leche', en: 'Leche' });
    expect(inserted[1]?.name).toEqual({ es: 'Leche', en: 'Leche' });
  });

  it('falla con un gzip corrupto', async () => {
    const bytes = await new Blob([new Uint8Array([0x1f, 0x8b, 0x00, 0x00])]).arrayBuffer();
    const manifest = await manifestFor(bytes, 1);

    await expect(importPack({ manifest, blob: new Blob([bytes]) })).rejects.toThrow();
  });

  it('round-trip de los macros opcionales y kcalDerived', async () => {
    const withMacros = [
      {
        barcode: '4006381333931',
        name: 'Crema',
        carbsPer100g: 10,
        proteinPer100g: 5,
        fatPer100g: 2,
        kcalPer100g: 78,
        kcalDerived: true,
        fiberPer100g: 6,
        sugarsPer100g: 4,
      },
    ];
    const bytes = await gzipText(jsonl(withMacros));
    const manifest = await manifestFor(bytes, withMacros.length);

    expect(await importPack({ manifest, blob: new Blob([bytes]) })).toEqual({ imported: 1 });
    const inserted = mocks.putProducts.mock.calls[0]?.[0] ?? [];
    expect(inserted[0]).toMatchObject({
      barcode: '4006381333931',
      proteinPer100g: 5,
      fatPer100g: 2,
      kcalPer100g: 78,
      kcalDerived: true,
      fiberPer100g: 6,
      sugarsPer100g: 4,
    });
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
