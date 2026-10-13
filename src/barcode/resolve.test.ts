import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarcodeFetcher } from './lookup/client';
import type { ScannedProduct } from './types';

const mocks = vi.hoisted(() => ({
  getProduct: vi.fn<(barcode: string) => Promise<ScannedProduct | null>>(),
  putProduct: vi.fn<(product: ScannedProduct) => Promise<void>>(async () => undefined),
}));

vi.mock('./store', () => ({ getProduct: mocks.getProduct, putProduct: mocks.putProduct }));

import { resolveBarcode } from './resolve';

const EAN = '4006381333931';

const found: ScannedProduct = {
  barcode: EAN,
  name: 'producto',
  carbsPer100g: 12,
  source: 'test',
  savedAt: 0,
};

function onlineBody(): unknown {
  return {
    status: 'success',
    product: {
      code: EAN,
      product_name_es: 'Crema',
      product_name_en: 'Cream',
      brands: 'Marca',
      nutrition_data_per: '100g',
      nutriments: { carbohydrates_100g: 57.5 },
    },
  };
}

function onlineFetcher() {
  return vi.fn<BarcodeFetcher>(async () => Response.json(onlineBody()));
}

beforeEach(() => {
  mocks.getProduct.mockReset();
  mocks.putProduct.mockReset();
  mocks.putProduct.mockResolvedValue(undefined);
});

describe('resolveBarcode', () => {
  it('devuelve invalid y no consulta el store con un codigo invalido', async () => {
    expect(await resolveBarcode('123')).toEqual({ kind: 'invalid' });
    expect(mocks.getProduct).not.toHaveBeenCalled();
  });

  it('devuelve hit cuando el producto existe', async () => {
    mocks.getProduct.mockResolvedValue(found);
    expect(await resolveBarcode(EAN)).toEqual({ kind: 'hit', product: found });
    expect(mocks.getProduct).toHaveBeenCalledWith(EAN);
  });

  it('devuelve miss cuando no existe', async () => {
    mocks.getProduct.mockResolvedValue(null);
    expect(await resolveBarcode(EAN)).toEqual({ kind: 'miss' });
  });

  it('normaliza un UPC-A a EAN-13 antes de buscar', async () => {
    mocks.getProduct.mockResolvedValue(null);
    await resolveBarcode('036000291452');
    expect(mocks.getProduct).toHaveBeenCalledWith('0036000291452');
  });

  it('con el flag offline un miss NO llama al fetcher', async () => {
    mocks.getProduct.mockResolvedValue(null);
    const fetcher = onlineFetcher();

    expect(await resolveBarcode(EAN, { online: false, fetcher })).toEqual({ kind: 'miss' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.putProduct).not.toHaveBeenCalled();
  });

  it('con online, un miss consulta el fetcher y cachea el hit', async () => {
    mocks.getProduct.mockResolvedValue(null);
    const fetcher = onlineFetcher();

    const result = await resolveBarcode(EAN, { online: true, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('hit');
    expect(mocks.putProduct).toHaveBeenCalledTimes(1);
    expect(mocks.putProduct.mock.calls[0]?.[0]).toMatchObject({
      barcode: EAN,
      carbsPer100g: 57.5,
      source: 'Open Food Facts',
    });
  });

  it('con online, si la consulta no devuelve producto cae a miss', async () => {
    mocks.getProduct.mockResolvedValue(null);
    const fetcher = vi.fn<BarcodeFetcher>(async () => new Response('nope', { status: 404 }));

    expect(await resolveBarcode(EAN, { online: true, fetcher })).toEqual({ kind: 'miss' });
    expect(mocks.putProduct).not.toHaveBeenCalled();
  });

  it('un hit local no llama al fetcher aunque online este activo', async () => {
    mocks.getProduct.mockResolvedValue(found);
    const fetcher = onlineFetcher();

    expect(await resolveBarcode(EAN, { online: true, fetcher })).toEqual({
      kind: 'hit',
      product: found,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
