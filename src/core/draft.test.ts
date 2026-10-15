import { describe, expect, it } from 'vitest';
import { DRAFT_VERSION, parseDraft, serializeDraft } from './draft';
import type { FoodItem } from './types';

function item(overrides: Partial<FoodItem> = {}): FoodItem {
  return { id: 'i1', name: 'Manzana', grams: 150, carbsPer100g: 14, ...overrides };
}

describe('borrador persistente (D62)', () => {
  it('hace ida y vuelta conservando items y origen', () => {
    const raw = serializeDraft('photo', [item({ classId: 'manzana' })]);
    expect(parseDraft(raw)).toEqual({
      version: DRAFT_VERSION,
      origin: 'photo',
      items: [item({ classId: 'manzana' })],
    });
  });

  it('devuelve null si falta, no es JSON o no es un objeto', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft(undefined)).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft('{no json')).toBeNull();
    expect(parseDraft('"texto"')).toBeNull();
    expect(parseDraft('{}')).toBeNull();
  });

  it('rechaza una version distinta', () => {
    const raw = JSON.stringify({ version: 99, origin: 'manual', items: [item()] });
    expect(parseDraft(raw)).toBeNull();
  });

  it('rechaza un origen invalido', () => {
    const raw = JSON.stringify({ version: DRAFT_VERSION, origin: 'otro', items: [item()] });
    expect(parseDraft(raw)).toBeNull();
  });

  it('un borrador sin items no es un borrador', () => {
    expect(parseDraft(serializeDraft('manual', []))).toBeNull();
  });

  it('descarta items malformados pero conserva los validos', () => {
    const raw = JSON.stringify({
      version: DRAFT_VERSION,
      origin: 'manual',
      items: [item({ id: 'ok' }), { id: 'x' }, 42, null],
    });
    const parsed = parseDraft(raw);
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]?.id).toBe('ok');
  });

  it('conserva barcode y brand opcionales y no inventa classId', () => {
    const raw = serializeDraft('manual', [item({ barcode: '123', brand: 'ACME' })]);
    expect(parseDraft(raw)?.items[0]).toMatchObject({ barcode: '123', brand: 'ACME' });
    expect(parseDraft(raw)?.items[0]).not.toHaveProperty('classId');
  });
});
