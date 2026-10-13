/**
 * Sondas de capacidad del dispositivo para decidir si el chat puede mostrarse.
 *
 * Todas las entradas son **inyectables** para poder testear sin navegador. La decision se
 * separa del sondeo: `detectCapabilities` lee el entorno y `chatCapable` decide con el tamano
 * del modelo. iPhone queda oculto siempre (WebGPU inestable y cuota que se borra).
 */

/** Memoria de dispositivo minima (GB) para cargar el LLM. */
export const MIN_DEVICE_MEMORY = 4;
/** Hilos minimos para que la inferencia sea viable. */
export const MIN_HARDWARE_CONCURRENCY = 4;
/** Margen de seguridad sobre el tamano del modelo al pedir cuota. */
export const STORAGE_MARGIN = 1.5;

export interface NavigatorLike {
  userAgent?: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  maxTouchPoints?: number;
  gpu?: unknown;
  userAgentData?: { platform?: string } | null;
  storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> } | null;
}

/** Sondas que no dependen del manifest ni de la red (WebGPU, iOS, memoria, hilos). */
export interface HardwareCapabilities {
  webgpu: boolean;
  ios: boolean;
  deviceMemory: number | null;
  hardwareConcurrency: number | null;
}

/** Cuota de almacenamiento observada (`navigator.storage.estimate`). */
export interface StorageCapabilities {
  quota: number | null;
  usage: number | null;
}

export interface ChatCapabilities extends HardwareCapabilities, StorageCapabilities {}

export interface CapabilityDeps {
  navigator?: NavigatorLike | null;
}

function currentNavigator(): NavigatorLike | null {
  return typeof navigator === 'undefined' ? null : (navigator as unknown as NavigatorLike);
}

/**
 * iPhone/iPad/iPod por UA, o `userAgentData.platform === 'iOS'`.
 *
 * iPadOS 13+ se anuncia con un UA de escritorio (`Macintosh; Intel Mac OS X`) y no trae
 * `iPad`; se detecta por la multitactilidad (`maxTouchPoints > 1`) junto con el UA
 * `Macintosh` o `userAgentData.platform === 'macOS'`.
 */
export function isIos(nav: NavigatorLike | null | undefined): boolean {
  if (!nav) return false;
  if (nav.userAgentData?.platform === 'iOS') return true;
  const userAgent = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  const touch = (nav.maxTouchPoints ?? 0) > 1;
  if (touch && /Macintosh/i.test(userAgent)) return true;
  if (touch && nav.userAgentData?.platform === 'macOS') return true;
  return false;
}

/** `'gpu' in navigator` como sonda de WebGPU. */
export function hasWebGpu(nav: NavigatorLike | null | undefined): boolean {
  return nav?.gpu != null;
}

function numberOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolveNavigator(deps: CapabilityDeps): NavigatorLike | null {
  return deps.navigator !== undefined ? deps.navigator : currentNavigator();
}

/**
 * Sondas que **no** dependen del manifest ni tocan la red: WebGPU, iOS, memoria de dispositivo e
 * hilos. Deben resolverse antes de pedir `chat-manifest.json`, de modo que un dispositivo no
 * soportado no haga ninguna peticion.
 */
export function detectHardwareCapabilities(deps: CapabilityDeps = {}): HardwareCapabilities {
  const nav = resolveNavigator(deps);
  if (!nav) return { webgpu: false, ios: false, deviceMemory: null, hardwareConcurrency: null };
  return {
    webgpu: hasWebGpu(nav),
    ios: isIos(nav),
    deviceMemory: numberOrNull(nav.deviceMemory),
    hardwareConcurrency: numberOrNull(nav.hardwareConcurrency),
  };
}

/** Lee la cuota de almacenamiento. Injectable y tolerante a fallos (`quota`/`usage` a `null`). */
export async function detectStorageCapabilities(
  deps: CapabilityDeps = {},
): Promise<StorageCapabilities> {
  const nav = resolveNavigator(deps);
  if (!nav) return { quota: null, usage: null };
  try {
    const estimate = await nav.storage?.estimate?.();
    if (!estimate) return { quota: null, usage: null };
    return { quota: numberOrNull(estimate.quota), usage: numberOrNull(estimate.usage) };
  } catch {
    return { quota: null, usage: null };
  }
}

/** Lee todas las sondas (hardware + cuota). API previa conservada para los tests existentes. */
export async function detectCapabilities(deps: CapabilityDeps = {}): Promise<ChatCapabilities> {
  return { ...detectHardwareCapabilities(deps), ...(await detectStorageCapabilities(deps)) };
}

/** Decide con las sondas de hardware. No mira la red ni la cuota. */
export function chatHardwareCapable(capabilities: HardwareCapabilities): boolean {
  if (!capabilities.webgpu) return false;
  if (capabilities.ios) return false;
  if (capabilities.deviceMemory !== null && capabilities.deviceMemory < MIN_DEVICE_MEMORY) {
    return false;
  }
  if (
    capabilities.hardwareConcurrency !== null &&
    capabilities.hardwareConcurrency < MIN_HARDWARE_CONCURRENCY
  ) {
    return false;
  }
  return true;
}

/** Decide con la cuota frente al tamano del modelo. Cuota desconocida no bloquea. */
export function chatStorageCapable(storage: StorageCapabilities, modelBytes: number): boolean {
  if (storage.quota === null) return true;
  const free = storage.quota - (storage.usage ?? 0);
  return free >= modelBytes * STORAGE_MARGIN;
}

/**
 * Decide si las sondas permiten el chat para un modelo de `modelBytes`. Si la cuota no se
 * puede medir (`quota === null`) no se bloquea por almacenamiento; el resto de sondas manda.
 */
export function chatCapable(capabilities: ChatCapabilities, modelBytes: number): boolean {
  return chatHardwareCapable(capabilities) && chatStorageCapable(capabilities, modelBytes);
}

export interface ChatLoadSources {
  detectHardware: () => HardwareCapabilities;
  /** Carga los bytes del modelo del manifest. Solo se llama si el hardware pasa. */
  loadModelBytes: () => Promise<number>;
  detectStorage: () => Promise<StorageCapabilities>;
}

export type ChatLoadDecision =
  | { status: 'ready'; modelBytes: number }
  | { status: 'unsupported' }
  | { status: 'manifest-missing' }
  | { status: 'storage'; modelBytes: number };

/**
 * Ordena el arranque del chat para que un dispositivo no soportado haga **cero** peticiones de
 * red: primero las sondas de hardware, solo despues el manifest y, por ultimo, la cuota con los
 * bytes ya conocidos. Si el hardware no pasa, `loadModelBytes` no se invoca nunca.
 */
export async function evaluateChatLoad(sources: ChatLoadSources): Promise<ChatLoadDecision> {
  const hardware = sources.detectHardware();
  if (!chatHardwareCapable(hardware)) return { status: 'unsupported' };
  let modelBytes: number;
  try {
    modelBytes = await sources.loadModelBytes();
  } catch {
    return { status: 'manifest-missing' };
  }
  const storage = await sources.detectStorage();
  if (!chatStorageCapable(storage, modelBytes)) return { status: 'storage', modelBytes };
  return { status: 'ready', modelBytes };
}
