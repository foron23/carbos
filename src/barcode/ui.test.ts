import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBarcodeAutoDownloadEnabled } from './flag';
import {
  importedPackIds,
  needsPackProvision,
  rememberPackIds,
  runProvision,
  shouldAutoProvision,
} from './ui';

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
    vi.unstubAllGlobals();
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

  it('activa la provision automatica al arranque por defecto', () => {
    expect(shouldAutoProvision()).toBe(true);
  });

  it('no provisiona al arranque si el autopack esta desactivado', () => {
    setBarcodeAutoDownloadEnabled(false);
    expect(shouldAutoProvision()).toBe(false);
  });

  it('no vuelve a provisionar al arranque si ya hay pack importado', () => {
    rememberPackIds(['es']);
    expect(shouldAutoProvision()).toBe(false);
  });

  it('no provisiona al arranque sin red', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(shouldAutoProvision()).toBe(false);
  });

  it('no re-descarga si ya esta provisionado (runProvision)', async () => {
    const download = vi.fn(async () => {});
    await runProvision({ imported: ['es'], count: async () => 0, download });
    expect(download).not.toHaveBeenCalled();
  });

  it('descarga cuando no hay pack (runProvision)', async () => {
    const download = vi.fn(async () => {});
    await runProvision({ imported: [], count: async () => 0, download });
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('sin almacen persistente cae al contador de productos (runProvision)', async () => {
    const download = vi.fn(async () => {});
    await runProvision({ imported: null, count: async () => 5, download });
    expect(download).not.toHaveBeenCalled();
    await runProvision({ imported: null, count: async () => 0, download });
    expect(download).toHaveBeenCalledTimes(1);
  });
});
