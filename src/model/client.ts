import type {
  DetectionInput,
  DetectionResult,
  InferenceErrorCode,
  InferencePhase,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

export interface ProgressEvent {
  phase: InferencePhase;
  loaded: number;
  total: number;
}

export interface DetectionCallbacks {
  onProgress?: (event: ProgressEvent) => void;
}

export interface DetectOptions {
  manifestUrl: string;
  cacheName: string;
  signal?: AbortSignal;
}

export interface DetectOutcome {
  results: DetectionResult[];
  engine: string;
  detector: string;
  classifier: string;
}

export interface DetectionClient {
  detect(
    input: DetectionInput,
    options: DetectOptions,
    callbacks?: DetectionCallbacks,
  ): Promise<DetectOutcome>;
  dispose(): void;
}

export class DetectionError extends Error {
  readonly code: InferenceErrorCode;

  constructor(code: InferenceErrorCode, message: string) {
    super(message);
    this.name = 'DetectionError';
    this.code = code;
  }
}

interface Pending {
  resolve: (outcome: DetectOutcome) => void;
  reject: (error: unknown) => void;
  callbacks: DetectionCallbacks | undefined;
}

export function createDetectionClient(): DetectionClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, Pending>();
  let nextId = 1;

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (!message || message.type === 'ready') return;
    const entry = pending.get(message.id);
    if (!entry) return;

    if (message.type === 'progress') {
      entry.callbacks?.onProgress?.({
        phase: message.phase,
        loaded: message.loaded,
        total: message.total,
      });
      return;
    }
    pending.delete(message.id);
    if (message.type === 'result') {
      entry.resolve({
        results: message.results,
        engine: message.engine,
        detector: message.detector,
        classifier: message.classifier,
      });
      return;
    }
    if (message.type === 'cancelled') {
      entry.reject(new DOMException('cancelado', 'AbortError'));
      return;
    }
    entry.reject(new DetectionError(message.code, message.message));
  });

  worker.addEventListener('error', () => {
    for (const entry of pending.values()) {
      entry.reject(new DetectionError('runtime', 'fallo del worker de inferencia'));
    }
    pending.clear();
  });

  return {
    detect(input, options, callbacks) {
      const id = nextId;
      nextId += 1;
      return new Promise<DetectOutcome>((resolve, reject) => {
        pending.set(id, { resolve, reject, callbacks });
        const request: WorkerRequest = {
          type: 'detect',
          id,
          manifestUrl: options.manifestUrl,
          cacheName: options.cacheName,
          image: input,
        };
        options.signal?.addEventListener(
          'abort',
          () => worker.postMessage({ type: 'cancel', id } satisfies WorkerRequest),
          { once: true },
        );
        worker.postMessage(request);
      });
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}
