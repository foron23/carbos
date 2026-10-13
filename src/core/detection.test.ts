import { describe, expect, it } from 'vitest';
import { applyAlternative, selectableTopk } from './detection';

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
