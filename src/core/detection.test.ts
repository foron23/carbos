import { describe, expect, it } from 'vitest';
import {
  applyAlternative,
  mergeDetections,
  selectableTopk,
  summarizeDetections,
} from './detection';

describe('alternativas del detector', () => {
  it('selectableTopk descarta las entradas sin clase resuelta', () => {
    const topk = [
      { label: 'manzana', classId: 'apple', p: 0.8 },
      { label: 'desconocido', classId: null, p: 0.6 },
      { label: 'pan', classId: 'bread', p: 0.4 },
    ];
    expect(selectableTopk(topk).map((entry) => entry.classId)).toEqual(['apple', 'bread']);
  });

  it('selectableTopk deja vacio un top-k sin clases', () => {
    expect(selectableTopk([{ label: 'x', classId: null, p: 1 }])).toEqual([]);
  });

  it('selectableTopk no repite la misma clase resuelta (alias al mismo alimento)', () => {
    const topk = [
      { label: 'bagel', classId: 'pan', p: 0.7 },
      { label: 'pretzel', classId: 'pan', p: 0.6 },
      { label: 'manzana', classId: 'apple', p: 0.5 },
    ];
    expect(selectableTopk(topk).map((entry) => entry.classId)).toEqual(['pan', 'apple']);
  });

  it('elegir una alternativa cambia nombre y carbohidratos y conserva los gramos', () => {
    const item = {
      id: 'f1',
      name: 'manzana',
      grams: 150,
      carbsPer100g: 13.8,
      classId: 'apple',
    };
    const updated = applyAlternative(item, { id: 'bread', name: 'pan', carbsPer100g: 50 });
    expect(updated).toEqual({
      id: 'f1',
      name: 'pan',
      grams: 150,
      carbsPer100g: 50,
      classId: 'bread',
    });
  });
});

describe('mergeDetections', () => {
  const box = (w: number, h: number) => ({ x: 0, y: 0, w, h });
  const det = (classId: string | null, score: number, w = 0.5, h = 0.5) => ({
    classId,
    score,
    box: box(w, h),
  });

  it('une la misma clase y conserva la de mayor confianza', () => {
    const merged = mergeDetections([
      det('pan_blanco', 0.4),
      det('manzana', 0.6),
      det('pan_blanco', 0.9),
      det('pan_blanco', 0.2),
    ]);
    expect(merged.map((entry) => entry.classId)).toEqual(['pan_blanco', 'manzana']);
    expect(merged[0]?.score).toBe(0.9);
  });

  it('ordena por confianza descendente', () => {
    const merged = mergeDetections([det('a', 0.3), det('b', 0.8), det('c', 0.5)]);
    expect(merged.map((entry) => entry.score)).toEqual([0.8, 0.5, 0.3]);
  });

  it('conserva las detecciones sin clase resuelta (ordenadas por confianza)', () => {
    const merged = mergeDetections([det(null, 0.9), det('pan', 0.3), det(null, 0.5)]);
    expect(merged.map((entry) => entry.classId)).toEqual([null, null, 'pan']);
  });

  it('no muta la entrada y con lista vacia devuelve vacio', () => {
    const input = [det('a', 0.5), det('a', 0.7)];
    const copy = input.map((entry) => ({ ...entry }));
    mergeDetections(input);
    expect(input).toEqual(copy);
    expect(mergeDetections([])).toEqual([]);
  });
});

describe('summarizeDetections', () => {
  it('separa resueltas y desconocidas en una lista mixta', () => {
    const summary = summarizeDetections([
      { classId: 'apple' },
      { classId: null },
      { classId: 'bread' },
      { classId: null },
    ]);
    expect(summary).toEqual({ resolved: 2, unknown: 2 });
  });

  it('cuenta todo como desconocido si no hay ninguna clase', () => {
    expect(summarizeDetections([{ classId: null }, { classId: null }])).toEqual({
      resolved: 0,
      unknown: 2,
    });
  });

  it('cuenta todo como resuelto si hay clase en todas', () => {
    expect(summarizeDetections([{ classId: 'a' }, { classId: 'b' }])).toEqual({
      resolved: 2,
      unknown: 0,
    });
  });

  it('con lista vacia no cuenta ninguna', () => {
    expect(summarizeDetections([])).toEqual({ resolved: 0, unknown: 0 });
  });
});
