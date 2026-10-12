import { describe, expect, it } from 'vitest';
import {
  IMAGENET_MEAN,
  IMAGENET_STD,
  UNIT_MEAN,
  UNIT_STD,
  clampBox,
  letterboxGeometry,
  normalizeBox,
  toNchw,
  unletterboxBox,
} from './preprocess';

describe('letterboxGeometry', () => {
  it('centra una imagen ancha con bandas arriba y abajo', () => {
    const geometry = letterboxGeometry(200, 100, 100, 100);
    expect(geometry.scale).toBe(0.5);
    expect(geometry.offsetX).toBe(0);
    expect(geometry.offsetY).toBe(25);
  });

  it('centra una imagen alta con bandas a los lados', () => {
    const geometry = letterboxGeometry(100, 200, 100, 100);
    expect(geometry.scale).toBe(0.5);
    expect(geometry.offsetX).toBe(25);
    expect(geometry.offsetY).toBe(0);
  });
});

describe('toNchw', () => {
  it('produce un tensor NCHW con normalizacion unitaria', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255]);
    const tensor = toNchw(rgba, 1, 1, UNIT_MEAN, UNIT_STD);
    expect(Array.from(tensor)).toEqual([1, 0, 0]);
  });

  it('aplica media y desviacion de ImageNet', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
    const tensor = toNchw(rgba, 1, 1, IMAGENET_MEAN, IMAGENET_STD);
    expect(tensor[0]).toBeCloseTo((0 - 0.485) / 0.229, 6);
    expect(tensor[1]).toBeCloseTo((0 - 0.456) / 0.224, 6);
    expect(tensor[2]).toBeCloseTo((0 - 0.406) / 0.225, 6);
  });
});

describe('mapeo de cajas', () => {
  it('deshace el letterbox a coordenadas originales', () => {
    const geometry = letterboxGeometry(200, 100, 100, 100);
    const box = unletterboxBox({ x: 10, y: 35, w: 50, h: 20 }, geometry);
    expect(box).toEqual({ x: 20, y: 20, w: 100, h: 40 });
  });

  it('normaliza y recorta a 0..1', () => {
    expect(normalizeBox({ x: 50, y: 50, w: 50, h: 50 }, 100, 100)).toEqual({
      x: 0.5,
      y: 0.5,
      w: 0.5,
      h: 0.5,
    });
    const clamped = clampBox({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 });
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0.9);
    expect(clamped.w).toBe(0.5);
    expect(clamped.h).toBeCloseTo(0.1, 6);
  });
});
