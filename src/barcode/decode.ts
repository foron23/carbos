import { normalizeEan } from './ean';

/**
 * Decodificacion local y **unificada** de un codigo de barras.
 *
 * Un solo camino: `decodeFrame` intenta primero el `BarcodeDetector` nativo
 * (Chrome/Android) y, si no esta o no encuentra nada, cae a **quagga2** (MIT, JS
 * puro, carga diferida). Asi el escaneo funciona en todos los navegadores
 * (incluido iOS/Firefox) sin depender de APIs experimentales. Todo en el
 * dispositivo: sin red. El hook `__carbosBarcodeStub` permite al arnes E2E
 * inyectar un decodificador sintetico. Nunca lanza.
 */

export interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
}

export interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
  getSupportedFormats?(): Promise<string[]>;
}

export interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

/** Hook E2E: decodificador sintetico que devuelve un EAN fijo. */
export interface BarcodeStub {
  decode(file?: Blob): Promise<string | null>;
}

export const BARCODE_FORMATS = ['ean_13', 'upc_a'];

/** Lectores de quagga2 (respaldo): EAN-13/8 y UPC-A/E. */
const QUAGGA_READERS = ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader'];

/** Lado mayor al que se reescala un fotograma antes de decodificar (velocidad). */
const MAX_EDGE = 1280;

/** El stub del arnes E2E, si esta instalado. */
export function barcodeStub(): BarcodeStub | undefined {
  const stub = (globalThis as { __carbosBarcodeStub?: BarcodeStub }).__carbosBarcodeStub;
  return stub && typeof stub.decode === 'function' ? stub : undefined;
}

/** El constructor nativo `BarcodeDetector`, si el navegador lo trae. */
export function barcodeDetectorCtor(): BarcodeDetectorConstructor | undefined {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : undefined;
}

async function supportedFormats(ctor: BarcodeDetectorConstructor): Promise<string[] | null> {
  try {
    if (typeof ctor.getSupportedFormats === 'function') {
      return await ctor.getSupportedFormats();
    }
  } catch {
    return null;
  }
  return null;
}

// El detector nativo se crea una sola vez (crearlo por fotograma es caro).
let nativeDetector: BarcodeDetectorLike | null | undefined;

async function getNativeDetector(): Promise<BarcodeDetectorLike | null> {
  if (nativeDetector !== undefined) return nativeDetector;
  const ctor = barcodeDetectorCtor();
  if (!ctor) {
    nativeDetector = null;
    return null;
  }
  try {
    const all = [...BARCODE_FORMATS];
    const supported = await supportedFormats(ctor);
    const formats = supported ? all.filter((format) => supported.includes(format)) : all;
    nativeDetector = formats.length > 0 ? new ctor({ formats }) : null;
  } catch {
    nativeDetector = null;
  }
  return nativeDetector;
}

async function decodeNative(frame: ImageBitmapSource): Promise<string | null> {
  try {
    const detector = await getNativeDetector();
    if (!detector) return null;
    const results = await detector.detect(frame);
    return results[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

interface QuaggaResult {
  codeResult?: { code?: string | null } | null;
}

interface QuaggaLike {
  decodeSingle(
    config: Record<string, unknown>,
    callback: (result: QuaggaResult | null) => void,
  ): void;
}

let quaggaModule: Promise<QuaggaLike | null> | null = null;

/** Carga diferida de quagga2: mantiene el decoder fuera del chunk de arranque. */
function loadQuagga(): Promise<QuaggaLike | null> {
  if (!quaggaModule) {
    quaggaModule = import('@ericblade/quagga2')
      .then((mod) => (mod as { default?: QuaggaLike }).default ?? (mod as unknown as QuaggaLike))
      .catch(() => null);
  }
  return quaggaModule;
}

/**
 * Dibuja el fotograma en un canvas reescalado (lado mayor <= maxEdge) para
 * quagga2. Si ya es un canvas se usa tal cual (el bucle en vivo pre-reescala).
 */
function toCanvas(frame: ImageBitmapSource, maxEdge = MAX_EDGE): HTMLCanvasElement | null {
  if (typeof HTMLCanvasElement !== 'undefined' && frame instanceof HTMLCanvasElement) {
    return frame;
  }
  const source = frame as CanvasImageSource & {
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
  };
  const width = source.videoWidth || source.naturalWidth || source.width || 0;
  const height = source.videoHeight || source.naturalHeight || source.height || 0;
  if (!width || !height) return null;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function decodeQuagga(frame: ImageBitmapSource): Promise<string | null> {
  const quagga = await loadQuagga();
  if (!quagga) return null;
  const canvas = toCanvas(frame);
  if (!canvas) return null;
  const src = canvas.toDataURL('image/jpeg', 0.8);
  return new Promise<string | null>((resolve) => {
    let settled = false;
    const done = (value: string | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      quagga.decodeSingle(
        { src, numOfWorkers: 0, locate: true, decoder: { readers: QUAGGA_READERS } },
        (result) => {
          const code = result?.codeResult?.code ?? null;
          done(code ? normalizeEan(code) : null);
        },
      );
    } catch {
      done(null);
    }
  });
}

/**
 * Decodifica un fotograma (canvas, video, imagen o bitmap): nativo primero,
 * quagga2 como respaldo. Devuelve el codigo o `null`. Nunca lanza.
 */
export async function decodeFrame(frame: ImageBitmapSource): Promise<string | null> {
  const stub = barcodeStub();
  if (stub) return (await stub.decode()) ?? null;
  const native = await decodeNative(frame);
  if (native) return normalizeEan(native) ?? native;
  return decodeQuagga(frame);
}

async function toSource(file: Blob): Promise<ImageBitmapSource> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = () => resolve(undefined);
      image.onerror = () => reject(new Error('imagen no legible'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeBarcodeFromFile(file: Blob): Promise<string | null> {
  try {
    const stub = barcodeStub();
    if (stub) return (await stub.decode(file)) ?? null;
    const frame = await toSource(file);
    const native = await decodeNative(frame);
    if (native) return normalizeEan(native) ?? native;
    return decodeQuagga(frame);
  } catch {
    return null;
  }
}
