import { describe, expect, it, vi } from 'vitest';
import {
  MIN_DEVICE_MEMORY,
  MIN_HARDWARE_CONCURRENCY,
  STORAGE_MARGIN,
  chatCapable,
  chatHardwareCapable,
  chatStorageCapable,
  detectCapabilities,
  detectHardwareCapabilities,
  detectStorageCapabilities,
  evaluateChatLoad,
  hasWebGpu,
  isIos,
} from './capability';
import type { ChatCapabilities, HardwareCapabilities, NavigatorLike } from './capability';

const MODEL_BYTES = 100_000_000;

function baseNav(overrides: NavigatorLike = {}): NavigatorLike {
  return {
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120',
    deviceMemory: 8,
    hardwareConcurrency: 8,
    gpu: {},
    storage: { estimate: () => Promise.resolve({ quota: 1_000_000_000, usage: 10_000_000 }) },
    ...overrides,
  };
}

async function detect(overrides: NavigatorLike = {}): Promise<ChatCapabilities> {
  return detectCapabilities({ navigator: baseNav(overrides) });
}

describe('isIos', () => {
  it('detecta iPhone/iPad/iPod por UA', () => {
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPod touch)' })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' })).toBe(false);
    expect(isIos(null)).toBe(false);
  });

  it('detecta iOS por userAgentData.platform', () => {
    expect(isIos({ userAgentData: { platform: 'iOS' } })).toBe(true);
    expect(isIos({ userAgentData: { platform: 'Android' } })).toBe(false);
  });

  it('detecta iPadOS 13+ (UA de escritorio con tactil)', () => {
    const ipadUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    expect(isIos({ userAgent: ipadUa, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: ipadUa, maxTouchPoints: 1 })).toBe(false);
    expect(isIos({ userAgent: ipadUa })).toBe(false);
    expect(isIos({ userAgentData: { platform: 'macOS' }, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgentData: { platform: 'macOS' }, maxTouchPoints: 1 })).toBe(false);
  });
});

describe('hasWebGpu', () => {
  it('comprueba la presencia de navigator.gpu', () => {
    expect(hasWebGpu({ gpu: {} })).toBe(true);
    expect(hasWebGpu({})).toBe(false);
    expect(hasWebGpu(null)).toBe(false);
  });
});

describe('detectCapabilities', () => {
  it('sin navigator devuelve todo apagado', async () => {
    const caps = await detectCapabilities({ navigator: null });
    expect(caps).toEqual({
      webgpu: false,
      ios: false,
      deviceMemory: null,
      hardwareConcurrency: null,
      quota: null,
      usage: null,
    });
  });

  it('lee gpu, memoria, hilos y cuota', async () => {
    const caps = await detect();
    expect(caps).toMatchObject({
      webgpu: true,
      ios: false,
      deviceMemory: 8,
      hardwareConcurrency: 8,
      quota: 1_000_000_000,
      usage: 10_000_000,
    });
  });

  it('devuelve null si un dato no esta disponible', async () => {
    const caps = await detectCapabilities({ navigator: { userAgent: 'Mozilla/5.0' } });
    expect(caps).toMatchObject({
      webgpu: false,
      deviceMemory: null,
      hardwareConcurrency: null,
      quota: null,
      usage: null,
    });
  });

  it('no lanza si storage.estimate falla', async () => {
    const caps = await detect({
      storage: { estimate: () => Promise.reject(new Error('no')) },
    });
    expect(caps.quota).toBeNull();
    expect(caps.usage).toBeNull();
  });
});

describe('chatCapable', () => {
  const capaz: ChatCapabilities = {
    webgpu: true,
    ios: false,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    quota: 1_000_000_000,
    usage: 10_000_000,
  };

  it('acepta un dispositivo capaz', () => {
    expect(chatCapable(capaz, MODEL_BYTES)).toBe(true);
  });

  it('oculta si no hay WebGPU', () => {
    expect(chatCapable({ ...capaz, webgpu: false }, MODEL_BYTES)).toBe(false);
  });

  it('oculta en iPhone aunque tenga WebGPU', () => {
    expect(chatCapable({ ...capaz, ios: true }, MODEL_BYTES)).toBe(false);
  });

  it('oculta con poca memoria o pocos hilos', () => {
    expect(chatCapable({ ...capaz, deviceMemory: MIN_DEVICE_MEMORY - 1 }, MODEL_BYTES)).toBe(false);
    expect(
      chatCapable({ ...capaz, hardwareConcurrency: MIN_HARDWARE_CONCURRENCY - 1 }, MODEL_BYTES),
    ).toBe(false);
    expect(
      chatCapable({ ...capaz, deviceMemory: null, hardwareConcurrency: null }, MODEL_BYTES),
    ).toBe(true);
  });

  it('oculta si la cuota libre no llega al margen del modelo', async () => {
    const justo = { quota: MODEL_BYTES * STORAGE_MARGIN, usage: 0 };
    expect(chatCapable({ ...capaz, ...justo }, MODEL_BYTES)).toBe(true);
    expect(
      chatCapable({ ...capaz, quota: MODEL_BYTES * STORAGE_MARGIN - 1, usage: 0 }, MODEL_BYTES),
    ).toBe(false);
    expect(
      chatCapable(
        { ...capaz, quota: MODEL_BYTES * STORAGE_MARGIN + 5_000, usage: 10_000 },
        MODEL_BYTES,
      ),
    ).toBe(false);
  });

  it('no bloquea por almacenamiento si la cuota es desconocida', () => {
    expect(chatCapable({ ...capaz, quota: null, usage: null }, MODEL_BYTES)).toBe(true);
  });

  it('separa la decision de hardware de la de almacenamiento', () => {
    expect(chatHardwareCapable(capaz)).toBe(true);
    expect(chatHardwareCapable({ ...capaz, webgpu: false })).toBe(false);
    expect(chatStorageCapable(capaz, MODEL_BYTES)).toBe(true);
    expect(chatStorageCapable({ quota: 10, usage: 0 }, MODEL_BYTES)).toBe(false);
    expect(chatStorageCapable({ quota: null, usage: null }, MODEL_BYTES)).toBe(true);
  });
});

describe('sondeo separado y orden de arranque', () => {
  it('el sondeo de hardware no consulta la cuota', async () => {
    const estimate = vi.fn(() => Promise.resolve({ quota: 100, usage: 1 }));
    const nav = baseNav({ storage: { estimate } });
    expect(detectHardwareCapabilities({ navigator: nav })).toEqual({
      webgpu: true,
      ios: false,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    });
    expect(estimate).not.toHaveBeenCalled();
    await expect(detectStorageCapabilities({ navigator: nav })).resolves.toEqual({
      quota: 100,
      usage: 1,
    });
    expect(estimate).toHaveBeenCalledTimes(1);
  });

  const hardwareOk: HardwareCapabilities = {
    webgpu: true,
    ios: false,
    deviceMemory: 8,
    hardwareConcurrency: 8,
  };
  const storageOk = (): Promise<{ quota: number; usage: number }> =>
    Promise.resolve({ quota: 1_000_000_000, usage: 0 });

  it('un dispositivo no capaz no pide el manifest (cero peticiones)', async () => {
    const loadModelBytes = vi.fn(() => Promise.resolve(MODEL_BYTES));
    const detectStorage = vi.fn(storageOk);
    const decision = await evaluateChatLoad({
      detectHardware: () => ({ ...hardwareOk, ios: true }),
      loadModelBytes,
      detectStorage,
    });
    expect(decision).toEqual({ status: 'unsupported' });
    expect(loadModelBytes).not.toHaveBeenCalled();
    expect(detectStorage).not.toHaveBeenCalled();
  });

  it('hardware -> manifest -> cuota, en ese orden', async () => {
    const calls: string[] = [];
    const decision = await evaluateChatLoad({
      detectHardware: () => {
        calls.push('hardware');
        return hardwareOk;
      },
      loadModelBytes: () => {
        calls.push('manifest');
        return Promise.resolve(MODEL_BYTES);
      },
      detectStorage: () => {
        calls.push('storage');
        return storageOk();
      },
    });
    expect(decision).toEqual({ status: 'ready', modelBytes: MODEL_BYTES });
    expect(calls).toEqual(['hardware', 'manifest', 'storage']);
  });

  it('sin manifest degrada en silencio', async () => {
    const decision = await evaluateChatLoad({
      detectHardware: () => hardwareOk,
      loadModelBytes: () => Promise.reject(new Error('sin manifest')),
      detectStorage: storageOk,
    });
    expect(decision).toEqual({ status: 'manifest-missing' });
  });

  it('oculta si la cuota no llega al margen del modelo', async () => {
    const decision = await evaluateChatLoad({
      detectHardware: () => hardwareOk,
      loadModelBytes: () => Promise.resolve(MODEL_BYTES),
      detectStorage: () => Promise.resolve({ quota: MODEL_BYTES * STORAGE_MARGIN - 1, usage: 0 }),
    });
    expect(decision).toEqual({ status: 'storage', modelBytes: MODEL_BYTES });
  });
});
