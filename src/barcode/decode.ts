/**
 * Decodificacion local de un codigo de barras desde una imagen.
 *
 * Usa `BarcodeDetector` nativo cuando existe (Chrome/Android). Si no (Firefox, iOS)
 * devuelve `null`: la entrada manual del EAN es la salida. El hook `__carbosBarcodeStub`
 * permite al arnes E2E inyectar un decodificador sintetico (patron `__carbosDetectionStub`).
 * Nunca lanza.
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

async function toSource(file: Blob): Promise<ImageBitmapSource> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file);
  }
  return file;
}

export async function decodeBarcodeFromFile(file: Blob): Promise<string | null> {
  try {
    const stub = barcodeStub();
    if (stub) {
      return (await stub.decode(file)) ?? null;
    }

    const ctor = barcodeDetectorCtor();
    if (!ctor) return null;

    const all = [...BARCODE_FORMATS];
    const supported = await supportedFormats(ctor);
    const formats = supported ? all.filter((format) => supported.includes(format)) : all;
    if (formats.length === 0) return null;

    const detector = new ctor({ formats });
    const results = await detector.detect(await toSource(file));
    const first = results[0];
    return first ? first.rawValue : null;
  } catch {
    return null;
  }
}
