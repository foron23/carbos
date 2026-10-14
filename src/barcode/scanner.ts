import { barcodeStub, decodeFrame } from './decode';

/**
 * Escaneo en tiempo real y **unificado**: abre la camara (`getUserMedia`) y
 * decodifica fotogramas en bucle con `decodeFrame` (nativo o quagga2) hasta
 * encontrar un codigo. Funciona en todos los navegadores; solo requiere permiso
 * de camara. El hook `__carbosBarcodeStub` permite al arnes E2E simularlo.
 *
 * El bucle reescala cada fotograma (lado mayor <= 800) y **no solapa** dos
 * decodificaciones: sin eso, quagga2 (que decodifica en el hilo principal) se
 * atasca y la UI parece colgada. Todo ocurre en el dispositivo: sin red.
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

/** Lado mayor al que se reescala el fotograma en vivo (velocidad de decodificacion). */
const LIVE_MAX_EDGE = 800;

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
    stream = await media.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
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

  const grab = document.createElement('canvas');
  const ctx = grab.getContext('2d');
  let stopped = false;
  let busy = false;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  const tick = (): void => {
    if (stopped || busy || !ctx) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;
    const scale = Math.min(1, LIVE_MAX_EDGE / Math.max(width, height));
    grab.width = Math.max(1, Math.round(width * scale));
    grab.height = Math.max(1, Math.round(height * scale));
    ctx.drawImage(video, 0, 0, grab.width, grab.height);
    busy = true;
    void decodeFrame(grab)
      .then((code) => {
        busy = false;
        if (code) {
          opts.onCode(code);
          stop();
        }
      })
      .catch(() => {
        busy = false;
      });
  };

  const timer = setInterval(tick, opts.intervalMs ?? 200);
  tick();

  return { stop };
}
