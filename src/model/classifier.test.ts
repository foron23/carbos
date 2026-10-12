import { describe, expect, it } from 'vitest';
import { classify, softmax, topK } from './classifier';

describe('softmax', () => {
  it('reparte por igual con logits iguales', () => {
    const probabilities = softmax([1, 1, 1]);
    for (const value of probabilities) expect(value).toBeCloseTo(1 / 3, 6);
  });

  it('suma 1 y es estable con valores grandes', () => {
    const probabilities = softmax([1000, 1001, 1002]);
    const sum = Array.from(probabilities).reduce((acc, value) => acc + value, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(probabilities[2]).toBeGreaterThan(probabilities[1] ?? 0);
  });
});

describe('topK', () => {
  it('ordena de mayor a menor y limita a k', () => {
    const result = topK([0.1, 0.7, 0.2], 2);
    expect(result).toEqual([
      { index: 1, p: 0.7 },
      { index: 2, p: 0.2 },
    ]);
  });

  it('devuelve vacio con k=0', () => {
    expect(topK([0.5, 0.5], 0)).toEqual([]);
  });
});

describe('classify', () => {
  it('aplica softmax y top-k', () => {
    const result = classify([0, 5, 0], 1);
    expect(result[0]?.index).toBe(1);
    expect(result[0]?.p).toBeGreaterThan(0.9);
  });
});
