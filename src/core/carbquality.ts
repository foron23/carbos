/**
 * Calidad del carbohidrato (SPEC 27).
 *
 * Indicador **propio y transparente** basado **solo en la fibra** del alimento.
 * NO es el indice glucemico: el IG es una respuesta fisiologica medida (ISO
 * 26642:2010) y **no** se deriva de la composicion (ver SPEC 27). Aqui no se
 * inventa ningun numero: se lee un dato que ya trae la fuente (`fiberPer100g`).
 *
 * Umbrales: los de las declaraciones nutricionales de la UE (Reglamento (CE)
 * 1924/2006), "fuente de fibra" >= 3 g/100 g y "alto contenido en fibra" >= 6 g/100 g,
 * expresados por 100 g de alimento, como la propia declaracion.
 *
 * La banda se **oculta** (`null`) cuando el alimento no es una fuente relevante de
 * carbohidratos o no se conoce su fibra: nunca se inventa.
 */
export type CarbQualityBand = 'low' | 'medium' | 'high';

/** Por debajo de esto el alimento no es una fuente de carbohidrato relevante. */
export const CARB_QUALITY_MIN_CARBS_PER_100G = 5;

/** Umbrales (g de fibra por 100 g) tomados de las declaraciones UE. */
export const FIBER_SOURCE_PER_100G = 3;
export const FIBER_HIGH_PER_100G = 6;

/** `true` si el alimento es una fuente relevante de carbohidratos. */
export function isCarbSource(carbsPer100g: number): boolean {
  return Number.isFinite(carbsPer100g) && carbsPer100g >= CARB_QUALITY_MIN_CARBS_PER_100G;
}

export function carbQualityBand(
  carbsPer100g: number,
  fiberPer100g: number | undefined,
): CarbQualityBand | null {
  if (!isCarbSource(carbsPer100g)) return null;
  if (fiberPer100g === undefined || !Number.isFinite(fiberPer100g)) return null;
  if (fiberPer100g >= FIBER_HIGH_PER_100G) return 'high';
  if (fiberPer100g >= FIBER_SOURCE_PER_100G) return 'medium';
  return 'low';
}
