/**
 * Decodificacion local de un codigo de barras desde una imagen.
 *
 * Usa `BarcodeDetector` nativo cuando existe (Chrome/Android). Si no (Firefox, iOS)
 * devuelve `null`: la entrada manual del EAN es la salida. El hook `__carbosBarcodeStub`
 * permite al arnes E2E inyectar un decodificador sintetico (patron `__carbosDetectionStub`).
 * Nunca lanza.
 */

interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
  getSupportedFormats?(): Promise<string[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

interface BarcodeStub {
  decode(file: Blob): Promise<string | null>;
}

const FORMATS = ['ean_13', 'upc_a'];

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
    const stub = (globalThis as { __carbosBarcodeStub?: BarcodeStub }).__carbosBarcodeStub;
    if (stub && typeof stub.decode === 'function') {
      return (await stub.decode(file)) ?? null;
    }

    const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (typeof ctor !== 'function') return null;

    const supported = await supportedFormats(ctor);
    const formats = supported ? FORMATS.filter((format) => supported.includes(format)) : FORMATS;
    if (formats.length === 0) return null;

    const detector = new ctor({ formats });
    const results = await detector.detect(await toSource(file));
    const first = results[0];
    return first ? first.rawValue : null;
  } catch {
    return null;
  }
}
