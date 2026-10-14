import { barcodeStub, decodeFrame } from './decode';

/**
 * Escaneo en tiempo real y **unificado**: abre la camara (`getUserMedia`) y
 * decodifica fotogramas en bucle con `decodeFrame` (nativo o quagga2) hasta
 * encontrar un codigo. Funciona en todos los navegadores; solo requiere permiso
 * de camara. El hook `__carbosBarcodeStub` permite al arnes E2E simularlo.
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

  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
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
    void decodeFrame(video)
      .then((code) => {
        if (code) {
          opts.onCode(code);
          stop();
        }
      })
      .catch(() => {
        /* fotograma no decodificable: seguimos */
      });
  }, opts.intervalMs ?? 350);

  return { stop };
}
