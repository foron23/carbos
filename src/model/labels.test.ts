import { describe, expect, it } from 'vitest';
import { UNKNOWN_CLASS } from '../catalog';
import { classifyTopK } from './labels';

const classes = ['spanish_omelette', 'paella', 'lentils'];

describe('classifyTopK (indice -> etiqueta -> catalogo)', () => {
  it('resuelve el indice ganador a su id de catalogo', () => {
    const [best] = classifyTopK([5, 0, 0], classes, 3);
    expect(best?.label).toBe('spanish_omelette');
    expect(best?.classId).toBe('tortilla_patatas');
  });

  it('ordena por probabilidad y respeta k', () => {
    const top = classifyTopK([0, 5, 1], classes, 2);
    expect(top.map((entry) => entry.label)).toEqual(['paella', 'lentils']);
  });

  it('cae a desconocido si el indice no tiene etiqueta', () => {
    const [best] = classifyTopK([9, 0, 0], ['', '', ''], 1);
    expect(best?.label).toBe(UNKNOWN_CLASS);
    expect(best?.classId).toBeNull();
  });

  it('devuelve classId null si la etiqueta no esta en el mapa', () => {
    const [best] = classifyTopK([1, 0], ['platillo_volador', 'apple'], 1);
    expect(best?.label).toBe('platillo_volador');
    expect(best?.classId).toBeNull();
  });
});
