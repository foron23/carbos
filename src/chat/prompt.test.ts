import { describe, expect, it } from 'vitest';
import { CHAT_ACTIONS, catalogHints, buildChatPrompt } from './prompt';
import type { Catalog } from '../catalog/types';

const catalog: Catalog = {
  version: 1,
  foods: [
    {
      id: 'pan_blanco',
      name: { es: 'Pan blanco', en: 'White bread' },
      synonyms: ['pan'],
      carbsPer100g: 58.3,
      defaultPortionGrams: 60,
      source: 'test',
    },
    {
      id: 'arroz_blanco',
      name: { es: 'Arroz blanco cocido', en: 'Cooked white rice' },
      synonyms: ['arroz'],
      carbsPer100g: 31.8,
      defaultPortionGrams: 200,
      source: 'test',
    },
  ],
};

describe('buildChatPrompt', () => {
  it('enumera el vocabulario cerrado completo', () => {
    const prompt = buildChatPrompt({
      locale: 'es',
      text: 'me comi una tortilla',
      today: '2026-10-13',
      catalog,
    });
    for (const action of CHAT_ACTIONS) {
      expect(prompt.system, `${action} falta`).toContain(action);
    }
    expect(prompt.system).toContain('JSON');
    expect(prompt.system).toContain('"action":"unknown"');
  });

  it('incluye el mensaje y la fecha en el prompt de usuario', () => {
    const prompt = buildChatPrompt({
      locale: 'es',
      text: 'dos tostadas',
      today: '2026-10-13',
      catalog,
    });
    expect(prompt.user).toContain('dos tostadas');
    expect(prompt.system).toContain('2026-10-13');
  });

  it('anade el catalogo como pista en el idioma pedido', () => {
    const es = buildChatPrompt({ locale: 'es', text: 'x', today: '2026-10-13', catalog });
    const en = buildChatPrompt({ locale: 'en', text: 'x', today: '2026-10-13', catalog });
    expect(es.system).toContain('Pan blanco');
    expect(es.system).toContain('Arroz blanco cocido');
    expect(en.system).toContain('White bread');
    expect(en.system).toContain('Cooked white rice');
    expect(en.system).not.toContain('Pan blanco');
  });

  it('produce prompts distintos en es y en', () => {
    const es = buildChatPrompt({ locale: 'es', text: 'x', today: '2026-10-13', catalog });
    const en = buildChatPrompt({ locale: 'en', text: 'x', today: '2026-10-13', catalog });
    expect(es.system).not.toBe(en.system);
    expect(es.user).toContain('Mensaje del usuario:');
    expect(en.user).toContain('User message:');
  });

  it('respeta el limite de pistas', () => {
    const prompt = buildChatPrompt({
      locale: 'es',
      text: 'x',
      today: '2026-10-13',
      catalog,
      hintLimit: 1,
    });
    expect(prompt.system).toContain('Pan blanco');
    expect(prompt.system).not.toContain('Arroz blanco cocido');
  });

  it('degrada a un texto neutro cuando no hay pistas', () => {
    const empty: Catalog = { version: 1, foods: [] };
    expect(
      buildChatPrompt({ locale: 'es', text: 'x', today: '2026-10-13', catalog: empty }).system,
    ).toContain('(sin alimentos)');
    expect(
      buildChatPrompt({ locale: 'en', text: 'x', today: '2026-10-13', catalog: empty }).system,
    ).toContain('(no foods)');
  });
});

describe('catalogHints', () => {
  it('devuelve los nombres en el idioma pedido y respeta el limite', () => {
    expect(catalogHints('es', catalog)).toEqual(['Pan blanco', 'Arroz blanco cocido']);
    expect(catalogHints('en', catalog, 1)).toEqual(['White bread']);
    expect(catalogHints('es', catalog, 0)).toEqual([]);
  });
});
