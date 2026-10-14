export interface PortionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PortionSize = 'small' | 'medium' | 'large';

export interface PortionSuggestion {
  grams: number;
  size: PortionSize;
}

export const PHOTO_PORTION_FACTORS = { small: 0.7, medium: 1, large: 1.4 } as const;

export const SIZE_THRESHOLDS = { smallMax: 0.15, largeMin: 0.35 } as const;

function sanitize(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function clampGrams(g: number): number {
  if (Number.isNaN(g) || g === -Infinity) {
    return 1;
  }
  if (g === Infinity) {
    return Number.MAX_VALUE;
  }
  return Math.max(1, Math.round(g));
}

export function suggestPortion(box: PortionBox, defaultGrams: number): PortionSuggestion {
  const area = sanitize(box.w) * sanitize(box.h);

  let size: PortionSize;
  if (area < SIZE_THRESHOLDS.smallMax) {
    size = 'small';
  } else if (area < SIZE_THRESHOLDS.largeMin) {
    size = 'medium';
  } else {
    size = 'large';
  }

  return { grams: clampGrams(defaultGrams * PHOTO_PORTION_FACTORS[size]), size };
}

export interface PortionItem {
  box: PortionBox;
  defaultGrams: number;
}

/**
 * Propone la porcion de VARIOS items de un plato repartiendo por **area** de la
 * caja (SPEC 18, D1): `gramos_i = default_i * (area_i / area_total)`. Sumar una
 * porcion completa por caja sobrecuenta cuando hay varias detecciones (el banco
 * pasó de 29,2 g a 16,3 g en el student con este reparto). Con **un solo item**
 * no hay reparto posible, asi que se conserva el factor por tamano de
 * `suggestPortion` (evita la regresion de la UX de una deteccion).
 */
export function suggestPortions(items: readonly PortionItem[]): number[] {
  if (items.length <= 1) {
    return items.map((item) => suggestPortion(item.box, item.defaultGrams).grams);
  }
  const areas = items.map((item) => sanitize(item.box.w) * sanitize(item.box.h));
  const total = areas.reduce((a, area) => a + area, 0);
  return items.map((item, index) => {
    const share = total > 0 ? (areas[index] ?? 0) / total : 1 / items.length;
    return clampGrams(item.defaultGrams * share);
  });
}
