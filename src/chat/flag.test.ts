import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChatDisabled, isChatEnabled, setChatDisabled, setChatEnabled } from './flag';

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

describe('flag del chat', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('esta apagado por defecto (opt-in)', () => {
    expect(isChatEnabled()).toBe(false);
    expect(isChatDisabled()).toBe(false);
  });

  it('se activa y se desactiva con el flag habilitado', () => {
    setChatEnabled(true);
    expect(isChatEnabled()).toBe(true);
    setChatEnabled(false);
    expect(isChatEnabled()).toBe(false);
  });

  it('un fallo de runtime lo deshabilita y lo oculta', () => {
    setChatEnabled(true);
    setChatDisabled(true);
    expect(isChatDisabled()).toBe(true);
    expect(isChatEnabled()).toBe(false);
  });

  it('limpiar el flag de deshabilitado lo reactiva si seguia habilitado', () => {
    setChatEnabled(true);
    setChatDisabled(true);
    setChatDisabled(false);
    expect(isChatDisabled()).toBe(false);
    expect(isChatEnabled()).toBe(true);
  });

  it('no lanza si localStorage no esta disponible', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(isChatEnabled()).toBe(false);
    expect(isChatDisabled()).toBe(false);
    expect(() => setChatEnabled(true)).not.toThrow();
    expect(() => setChatDisabled(true)).not.toThrow();
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
    expect(isChatEnabled()).toBe(false);
    expect(isChatDisabled()).toBe(false);
    expect(() => setChatEnabled(true)).not.toThrow();
    expect(() => setChatDisabled(true)).not.toThrow();
  });
});
