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
