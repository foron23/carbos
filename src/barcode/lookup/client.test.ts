import { describe, expect, it, vi } from 'vitest';
import { lookupOnline } from './client';
import type { BarcodeFetcher } from './client';

const EAN = '4006381333931';
const EXPECTED_URL =
  'https://world.openfoodfacts.org/api/v3/product/4006381333931.json' +
  '?fields=code,product_name,product_name_es,product_name_en,brands,serving_quantity,' +
  'nutrition_data_per,nutriments.carbohydrates_100g';

function successBody(): unknown {
  return {
    status: 'success',
    product: {
      code: EAN,
      product_name: 'Crema',
      product_name_es: 'Crema de cacahuete',
      product_name_en: 'Peanut butter',
      brands: 'Marca X, Otra',
      serving_quantity: '15',
      nutrition_data_per: '100g',
      nutriments: { carbohydrates_100g: 12.5 },
    },
  };
}

function fetcherFor(body: unknown, init?: ResponseInit) {
  return vi.fn<(input: string, inputInit?: RequestInit) => Promise<Response>>(async () =>
    Response.json(body, init),
  );
}

describe('lookupOnline', () => {
  it('mapea una respuesta v3 correcta y envia el X-User-Agent y la URL', async () => {
    const fetcher = fetcherFor(successBody());

    const result = await lookupOnline(EAN, { fetcher });

    expect(result).toMatchObject({
      barcode: EAN,
      name: { es: 'Crema de cacahuete', en: 'Peanut butter' },
      brand: 'Marca X',
      carbsPer100g: 12.5,
      source: 'Open Food Facts',
    });
    expect(result?.savedAt).toEqual(expect.any(Number));

    const call = fetcher.mock.calls[0];
    expect(call?.[0]).toBe(EXPECTED_URL);
    expect(call?.[1]?.headers).toMatchObject({
      'X-User-Agent': 'Carbos/0.0.0 (barcode lookup).',
    });
  });

  it('cae a product_name como nombre si no hay traducciones', async () => {
    const fetcher = fetcherFor({
      status: 'success',
      product: { product_name: 'Generico', nutriments: { carbohydrates_100g: 3 } },
    });

    const result = await lookupOnline(EAN, { fetcher });

    expect(result?.name).toBe('Generico');
  });

  it('devuelve null en un 404', async () => {
    const fetcher = fetcherFor({}, { status: 404, statusText: 'Not Found' });
    expect(await lookupOnline(EAN, { fetcher })).toBeNull();
  });

  it('devuelve null si status no es success', async () => {
    const fetcher = fetcherFor({ status: 'failure', product: {} });
    expect(await lookupOnline(EAN, { fetcher })).toBeNull();
  });

  it('devuelve null si faltan los carbohidratos', async () => {
    const fetcher = fetcherFor({
      status: 'success',
      product: { product_name_es: 'Sin datos', nutriments: {} },
    });
    expect(await lookupOnline(EAN, { fetcher })).toBeNull();
  });

  it('devuelve null si nutrition_data_per es 100ml (no se mapea ml a gramos)', async () => {
    const fetcher = fetcherFor({
      status: 'success',
      product: {
        product_name_es: 'Bebida',
        nutrition_data_per: '100ml',
        nutriments: { carbohydrates_100g: 8 },
      },
    });
    expect(await lookupOnline(EAN, { fetcher })).toBeNull();
  });

  it('devuelve null si la respuesta no es JSON valido', async () => {
    const fetcher = vi.fn<(input: string, inputInit?: RequestInit) => Promise<Response>>(
      async () => new Response('no-es-json', { status: 200 }),
    );
    expect(await lookupOnline(EAN, { fetcher })).toBeNull();
  });

  it('devuelve null (nunca lanza) si el fetcher lanza', async () => {
    const fetcher: BarcodeFetcher = () => Promise.reject(new Error('sin red'));
    expect(await lookupOnline(EAN, { fetcher })).toBeNull();
  });
});
