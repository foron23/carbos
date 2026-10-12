import { PNG } from 'pngjs';
import type { PixelBox } from '../src/model/preprocess.ts';

export interface Rgba {
  data: Uint8Array;
  width: number;
  height: number;
}

export function decodePng(bytes: Uint8Array): Rgba {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { data: new Uint8Array(png.data), width: png.width, height: png.height };
}

function sample(src: Rgba, x: number, y: number, channel: number): number {
  const cx = Math.min(src.width - 1, Math.max(0, x));
  const cy = Math.min(src.height - 1, Math.max(0, y));
  return src.data[(cy * src.width + cx) * 4 + channel] ?? 0;
}

export function resizeBilinear(src: Rgba, dw: number, dh: number): Rgba {
  const out = new Uint8Array(dw * dh * 4);
  const sx = src.width / dw;
  const sy = src.height / dh;
  for (let y = 0; y < dh; y += 1) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5);
    const y0 = Math.floor(fy);
    const y1 = y0 + 1;
    const wy = fy - y0;
    for (let x = 0; x < dw; x += 1) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5);
      const x0 = Math.floor(fx);
      const x1 = x0 + 1;
      const wx = fx - x0;
      const offset = (y * dw + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const top = sample(src, x0, y0, c) * (1 - wx) + sample(src, x1, y0, c) * wx;
        const bottom = sample(src, x0, y1, c) * (1 - wx) + sample(src, x1, y1, c) * wx;
        out[offset + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
    }
  }
  return { data: out, width: dw, height: dh };
}

export function letterbox(src: Rgba, size: number, pad: number): Rgba {
  const scale = Math.min(size / src.width, size / src.height);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const resized = resizeBilinear(src, w, h);
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    out[i * 4] = pad;
    out[i * 4 + 1] = pad;
    out[i * 4 + 2] = pad;
    out[i * 4 + 3] = 255;
  }
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const s = (y * w + x) * 4;
      const d = ((y + oy) * size + (x + ox)) * 4;
      out[d] = resized.data[s] ?? 0;
      out[d + 1] = resized.data[s + 1] ?? 0;
      out[d + 2] = resized.data[s + 2] ?? 0;
      out[d + 3] = resized.data[s + 3] ?? 255;
    }
  }
  return { data: out, width: size, height: size };
}

export function crop(src: Rgba, box: PixelBox): Rgba {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.max(1, Math.min(src.width - x, Math.round(box.w)));
  const h = Math.max(1, Math.min(src.height - y, Math.round(box.h)));
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const from = ((y + row) * src.width + x) * 4;
    out.set(src.data.subarray(from, from + w * 4), row * w * 4);
  }
  return { data: out, width: w, height: h };
}
