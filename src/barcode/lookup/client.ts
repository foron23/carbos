import { normalizeEan } from '../ean';
import type { ScannedProduct } from '../types';
import { offResponseSchema } from './schema';
import type { OffProduct, OffResponse } from './schema';

/**
 * Cliente de resolucion en linea (Fase B, opt-in) contra la API v3 de Open Food
 * Facts. Es la **unica** ruta de red del escaneo ademas de la descarga explicita
 * de packs; por eso `lookupOnline` nunca lanza: ante cualquier fallo devuelve
 * `null` y el llamante cae al camino local.
 */

export type BarcodeFetcher = (input: string, init?: RequestInit) => Promise<Response>;

const OFF_BASE = 'https://world.openfoodfacts.org';
const USER_AGENT = 'Carbos/0.0.0 (barcode lookup).';
const FIELDS = [
  'code',
  'product_name',
  'product_name_es',
  'product_name_en',
  'brands',
  'serving_quantity',
  'nutrition_data_per',
  'nutriments.carbohydrates_100g',
  'nutriments.proteins_100g',
  'nutriments.fat_100g',
  'nutriments.energy-kcal_100g',
  'nutriments.fiber_100g',
  'nutriments.sugars_100g',
].join(',');

function urlFor(ean: string): string {
  return `${OFF_BASE}/api/v3/product/${ean}.json?fields=${FIELDS}`;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Macro opcional: solo se conserva si es finito y no negativo. */
function toMacro(value: number | string | null | undefined): number | undefined {
  const parsed = toNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : undefined;
}

/** Nombre por locale; si falta uno se cae al otro o a `product_name` como cadena. */
function pickName(product: OffProduct): { es: string; en: string } | string | null {
  const es = product.product_name_es?.trim();
  const en = product.product_name_en?.trim();
  if (es || en) return { es: es || en || '', en: en || es || '' };
  const fallback = product.product_name?.trim();
  return fallback ? fallback : null;
}

function mapProduct(ean: string, response: OffResponse): ScannedProduct | null {
  // OFF v3 usa `status` = "success", "success_with_warnings" o "failure"; exigir
  // solo "success" rechazaba productos validos con avisos. El fallo real es
  // `failure` (o la ausencia de `product`).
  const status = response.status ?? '';
  if (typeof status === 'string' && status.startsWith('failure')) return null;
  const product = response.product;
  if (!product) return null;
  // Los liquidos vienen por 100 ml: no se mapean a gramos a ciegas.
  if (product.nutrition_data_per?.trim().toLowerCase() === '100ml') return null;
  const carbs = toNumber(product.nutriments?.carbohydrates_100g);
  if (carbs === null || carbs < 0) return null;
  const name = pickName(product);
  if (!name) return null;

  const result: ScannedProduct = {
    barcode: ean,
    name,
    carbsPer100g: carbs,
    source: 'Open Food Facts',
    savedAt: Date.now(),
  };
  const brand = product.brands?.split(',')[0]?.trim();
  if (brand) result.brand = brand;
  const protein = toMacro(product.nutriments?.proteins_100g);
  const fat = toMacro(product.nutriments?.fat_100g);
  const fiber = toMacro(product.nutriments?.fiber_100g);
  const sugars = toMacro(product.nutriments?.sugars_100g);
  if (protein !== undefined) result.proteinPer100g = protein;
  if (fat !== undefined) result.fatPer100g = fat;
  if (fiber !== undefined) result.fiberPer100g = fiber;
  if (sugars !== undefined) result.sugarsPer100g = sugars;
  // kcal de la fuente; si falta pero hay proteina+grasa+carbos, se deriva 4/4/9.
  const kcal = toMacro(product.nutriments?.['energy-kcal_100g']);
  if (kcal !== undefined) {
    result.kcalPer100g = kcal;
  } else if (protein !== undefined && fat !== undefined) {
    result.kcalPer100g = 4 * carbs + 4 * protein + 9 * fat;
    result.kcalDerived = true;
  }
  return result;
}

/**
 * GET del producto por EAN. Devuelve `null` en 404, `status !== "success"`,
 * sin carbohidratos o con `nutrition_data_per === "100ml"`; nunca lanza.
 */
export async function lookupOnline(
  barcode: string,
  opts: { fetcher?: BarcodeFetcher; signal?: AbortSignal } = {},
): Promise<ScannedProduct | null> {
  const ean = normalizeEan(barcode);
  if (!ean) return null;
  const fetcher = opts.fetcher ?? fetch;
  const init: RequestInit = { headers: { 'X-User-Agent': USER_AGENT } };
  if (opts.signal) init.signal = opts.signal;
  try {
    const response = await fetcher(urlFor(ean), init);
    if (!response.ok) return null;
    const parsed = offResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return mapProduct(ean, parsed.data);
  } catch {
    return null;
  }
}
