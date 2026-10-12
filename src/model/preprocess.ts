export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LetterboxGeometry {
  scale: number;
  offsetX: number;
  offsetY: number;
  inputWidth: number;
  inputHeight: number;
}

export const DETECTOR_INPUT = 640;
export const CLASSIFIER_INPUT = 224;
export const PAD_VALUE = 114;

export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const;
export const UNIT_MEAN = [0, 0, 0] as const;
export const UNIT_STD = [1, 1, 1] as const;

export function letterboxGeometry(
  width: number,
  height: number,
  inputWidth: number,
  inputHeight: number,
): LetterboxGeometry {
  const scale = Math.min(inputWidth / width, inputHeight / height);
  return {
    scale,
    offsetX: (inputWidth - width * scale) / 2,
    offsetY: (inputHeight - height * scale) / 2,
    inputWidth,
    inputHeight,
  };
}

export function toNchw(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  mean: readonly [number, number, number],
  std: readonly [number, number, number],
): Float32Array {
  const pixels = width * height;
  const out = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i += 1) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    out[i] = (r / 255 - mean[0]) / std[0];
    out[pixels + i] = (g / 255 - mean[1]) / std[1];
    out[2 * pixels + i] = (b / 255 - mean[2]) / std[2];
  }
  return out;
}

export function unletterboxBox(box: PixelBox, geometry: LetterboxGeometry): PixelBox {
  return {
    x: (box.x - geometry.offsetX) / geometry.scale,
    y: (box.y - geometry.offsetY) / geometry.scale,
    w: box.w / geometry.scale,
    h: box.h / geometry.scale,
  };
}

export function normalizeBox(box: PixelBox, width: number, height: number): PixelBox {
  return {
    x: box.x / width,
    y: box.y / height,
    w: box.w / width,
    h: box.h / height,
  };
}

export function clampBox(box: PixelBox): PixelBox {
  const x = Math.max(0, Math.min(1, box.x));
  const y = Math.max(0, Math.min(1, box.y));
  const w = Math.max(0, Math.min(1 - x, box.w));
  const h = Math.max(0, Math.min(1 - y, box.h));
  return { x, y, w, h };
}
