import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isBarcodeAutoDownloadEnabled,
  isBarcodeEnabled,
  isBarcodeOnlineEnabled,
  setBarcodeAutoDownloadEnabled,
  setBarcodeEnabled,
  setBarcodeOnlineEnabled,
} from './flag';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as unknown as Storage;
}

describe('flag del codigo de barras', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('esta apagado por defecto (opt-in)', () => {
    expect(isBarcodeEnabled()).toBe(false);
  });

  it('se activa y se desactiva con el flag', () => {
    setBarcodeEnabled(true);
    expect(isBarcodeEnabled()).toBe(true);
    setBarcodeEnabled(false);
    expect(isBarcodeEnabled()).toBe(false);
  });

  it('no lanza si localStorage no esta disponible', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(isBarcodeEnabled()).toBe(false);
    expect(() => setBarcodeEnabled(true)).not.toThrow();
  });

  it('no lanza si localStorage lanza al leer o escribir', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(isBarcodeEnabled()).toBe(false);
    expect(() => setBarcodeEnabled(true)).not.toThrow();
  });

  it('la resolucion en linea esta apagada por defecto (opt-in)', () => {
    expect(isBarcodeOnlineEnabled()).toBe(false);
  });

  it('la resolucion en linea se activa y se revoca con su flag', () => {
    setBarcodeOnlineEnabled(true);
    expect(isBarcodeOnlineEnabled()).toBe(true);
    setBarcodeOnlineEnabled(false);
    expect(isBarcodeOnlineEnabled()).toBe(false);
  });

  it('la resolucion en linea no lanza sin localStorage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(isBarcodeOnlineEnabled()).toBe(false);
    expect(() => setBarcodeOnlineEnabled(true)).not.toThrow();
  });

  it('la descarga automatica del pack esta activada por defecto', () => {
    expect(isBarcodeAutoDownloadEnabled()).toBe(true);
  });

  it('la descarga automatica se desactiva y se reactiva con su flag', () => {
    setBarcodeAutoDownloadEnabled(false);
    expect(isBarcodeAutoDownloadEnabled()).toBe(false);
    setBarcodeAutoDownloadEnabled(true);
    expect(isBarcodeAutoDownloadEnabled()).toBe(true);
  });

  it('cualquier valor distinto de "false" mantiene la descarga activada', () => {
    localStorage.setItem('carbos.barcode.autopack', 'true');
    expect(isBarcodeAutoDownloadEnabled()).toBe(true);
    localStorage.setItem('carbos.barcode.autopack', 'cualquier cosa');
    expect(isBarcodeAutoDownloadEnabled()).toBe(true);
  });

  it('la descarga automatica no lanza sin localStorage (defecto on)', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(isBarcodeAutoDownloadEnabled()).toBe(true);
    expect(() => setBarcodeAutoDownloadEnabled(false)).not.toThrow();
  });

  it('la descarga automatica no lanza si localStorage lanza (defecto on)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(isBarcodeAutoDownloadEnabled()).toBe(true);
    expect(() => setBarcodeAutoDownloadEnabled(false)).not.toThrow();
  });
});
