export interface Scored {
  index: number;
  p: number;
}

export function softmax(logits: ArrayLike<number>): Float32Array {
  const out = new Float32Array(logits.length);
  let max = -Infinity;
  for (let i = 0; i < logits.length; i += 1) {
    const value = logits[i] ?? 0;
    if (value > max) max = value;
  }
  let sum = 0;
  for (let i = 0; i < logits.length; i += 1) {
    const value = Math.exp((logits[i] ?? 0) - max);
    out[i] = value;
    sum += value;
  }
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) / sum;
  return out;
}

export function topK(probabilities: ArrayLike<number>, k: number): Scored[] {
  const scored: Scored[] = [];
  for (let i = 0; i < probabilities.length; i += 1) {
    scored.push({ index: i, p: probabilities[i] ?? 0 });
  }
  scored.sort((a, b) => b.p - a.p);
  return scored.slice(0, Math.max(0, k));
}

export function classify(logits: ArrayLike<number>, k: number): Scored[] {
  return topK(softmax(logits), k);
}
