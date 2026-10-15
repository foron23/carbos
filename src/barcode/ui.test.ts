import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importedPackIds, needsPackProvision, rememberPackIds } from './ui';

/**
 * El bug corregido: el escaneo decidia "ya tengo pack" por `countProducts() > 0`,
 * pero la consulta en linea cachea productos en el MISMO store, de modo que un
 * unico producto cacheado impedia descargar el pack. Ahora la senal es la lista
 * de packs importados.
 */
describe('provision de packs de codigo de barras', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('pide provisionar el pack mientras no se haya importado ninguno', () => {
    expect(needsPackProvision([])).toBe(true);
    expect(needsPackProvision(['es'])).toBe(false);
  });

  it('sin nada guardado devuelve lista vacia (y tolera JSON corrupto)', () => {
    expect(importedPackIds()).toEqual([]);
    store.set('carbos.barcode.packs', '{no es json');
    expect(importedPackIds()).toEqual([]);
  });

  it('recuerda los packs importados sin duplicar', () => {
    rememberPackIds(['es', 'es-rest']);
    rememberPackIds(['es']);
    expect(importedPackIds().sort()).toEqual(['es', 'es-rest']);
  });
});
