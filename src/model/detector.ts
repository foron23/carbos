import type { PixelBox } from './preprocess';

export interface Candidate {
  box: PixelBox;
  score: number;
  classIndex: number;
}

export interface DetectionOptions {
  scoreThreshold: number;
  iouThreshold: number;
  maxDetections?: number;
}

export function iou(a: PixelBox, b: PixelBox): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const interW = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const interH = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = interW * interH;
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

export function decodeYolov8(
  data: Float32Array,
  anchors: number,
  numClasses: number,
  scoreThreshold: number,
): Candidate[] {
  const channels = 4 + numClasses;
  if (anchors <= 0 || channels <= 4 || data.length < channels * anchors) return [];
  const candidates: Candidate[] = [];
  for (let a = 0; a < anchors; a += 1) {
    let best = 0;
    let bestClass = 0;
    for (let c = 0; c < numClasses; c += 1) {
      const score = data[(4 + c) * anchors + a] ?? 0;
      if (score > best) {
        best = score;
        bestClass = c;
      }
    }
    if (best < scoreThreshold) continue;
    const cx = data[a] ?? 0;
    const cy = data[anchors + a] ?? 0;
    const w = data[2 * anchors + a] ?? 0;
    const h = data[3 * anchors + a] ?? 0;
    if (w <= 0 || h <= 0) continue;
    candidates.push({
      box: { x: cx - w / 2, y: cy - h / 2, w, h },
      score: best,
      classIndex: bestClass,
    });
  }
  return candidates;
}

export function nms(candidates: Candidate[], options: DetectionOptions): Candidate[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const kept: Candidate[] = [];
  const limit = options.maxDetections ?? 100;
  for (const candidate of sorted) {
    if (kept.length >= limit) break;
    const overlaps = kept.some((other) => iou(candidate.box, other.box) > options.iouThreshold);
    if (!overlaps) kept.push(candidate);
  }
  return kept;
}

export function detect(
  data: Float32Array,
  anchors: number,
  numClasses: number,
  options: DetectionOptions,
): Candidate[] {
  return nms(decodeYolov8(data, anchors, numClasses, options.scoreThreshold), options);
}
