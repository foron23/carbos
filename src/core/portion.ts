export const PORTION_FACTORS = { small: 0.7, medium: 1, large: 1.4 } as const;
export const PORTION_SIZES = ['small', 'medium', 'large'] as const;
export type PortionSize = keyof typeof PORTION_FACTORS;

export function clampGrams(g: number): number {
  return Number.isFinite(g) ? Math.max(1, Math.round(g)) : 1;
}

export function scaleGrams(g: number, factor: number): number {
  return clampGrams(g * factor);
}

export function portionGrams(def: number, size: PortionSize): number {
  return clampGrams(def * PORTION_FACTORS[size]);
}
