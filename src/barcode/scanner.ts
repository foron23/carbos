import { BARCODE_FORMATS, barcodeDetectorCtor, barcodeStub } from './decode';
import type { BarcodeDetectorLike } from './decode';

/**
 * Escaneo en tiempo real: abre la camara y decodifica fotogramas hasta encontrar
 * un codigo. Requiere `BarcodeDetector` (Chrome/Android; no hay deteccion en vivo
 * en iOS/Firefox), en cuyo caso devuelve `null` y la UI cae a la foto o a la
 * entrada manual. El hook `__carbosBarcodeStub` permite al arnes E2E simularlo.
 *
 * Todo ocurre en el dispositivo: la camara no sale de aqui y no hay red.
 */

export interface LiveScanHandle {
  stop(): void;
}

export interface LiveScanOptions {
  video: HTMLVideoElement;
  onCode: (code: string) => void;
  onError?: (reason: 'denied' | 'unsupported') => void;
  intervalMs?: number;
}

export async function startLiveScan(opts: LiveScanOptions): Promise<LiveScanHandle | null> {
  // Stub E2E: deteccion inmediata sin camara.
  const stub = barcodeStub();
  if (stub) {
    const code = await stub.decode();
    if (code) opts.onCode(code);
    return { stop: () => undefined };
  }

  const ctor = barcodeDetectorCtor();
  const media = navigator.mediaDevices;
  if (!ctor || !media?.getUserMedia) {
    opts.onError?.('unsupported');
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await media.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    opts.onError?.('denied');
    return null;
  }

  const { video } = opts;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    /* autoplay puede requerir gesto: el bucle igualmente intenta decodificar */
  }

  let detector: BarcodeDetectorLike;
  try {
    detector = new ctor({ formats: [...BARCODE_FORMATS] });
  } catch {
    detector = new ctor();
  }

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  const timer = setInterval(() => {
    if (stopped) return;
    void detector
      .detect(video)
      .then((results) => {
        const first = results[0];
        if (first?.rawValue) {
          opts.onCode(first.rawValue);
          stop();
        }
      })
      .catch(() => {
        /* fotograma no decodificable: seguimos */
      });
  }, opts.intervalMs ?? 250);

  return { stop };
}
