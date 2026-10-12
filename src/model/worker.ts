import { DEFAULT_CLASSMAP, resolveClass } from '../catalog';
import { CATALOG } from '../catalog';
import { classify } from './classifier';
import { detect } from './detector';
import { fetchManifest, loadAsset, verifySha256 } from './loader';
import {
  CLASSIFIER_INPUT,
  DETECTOR_INPUT,
  IMAGENET_MEAN,
  IMAGENET_STD,
  PAD_VALUE,
  UNIT_MEAN,
  UNIT_STD,
  letterboxGeometry,
  normalizeBox,
  toNchw,
  unletterboxBox,
} from './preprocess';
import type { PixelBox } from './preprocess';
import type {
  DetectionResult,
  InferenceErrorCode,
  InferencePhase,
  TopKEntry,
  WorkerRequest,
  WorkerResponse,
} from './protocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

const SCORE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const MAX_DETECTIONS = 12;
const TOP_K = 3;
const CROP_MARGIN = 0.1;

type Session = import('onnxruntime-web/webgpu').InferenceSession;
type Runtime = typeof import('onnxruntime-web/webgpu');

let runtimePromise: Promise<{ ort: Runtime; providers: string[]; engine: string }> | null = null;
const sessionCache = new Map<string, Promise<Session>>();
const cancelled = new Set<number>();

function post(message: WorkerResponse): void {
  scope.postMessage(message);
}

function progress(id: number, phase: InferencePhase, loaded = 0, total = 0): void {
  post({ type: 'progress', id, phase, loaded, total });
}

async function getRuntime(): Promise<{ ort: Runtime; providers: string[]; engine: string }> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const ort = await import('onnxruntime-web/webgpu');
      const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
      const providers = hasWebGPU ? ['webgpu', 'wasm'] : ['wasm'];
      return { ort, providers, engine: hasWebGPU ? 'webgpu' : 'wasm' };
    })();
  }
  return runtimePromise;
}

async function getSession(
  ort: Runtime,
  providers: string[],
  url: string,
  model: ArrayBuffer,
): Promise<Session> {
  const key = `${url}#${providers.join(',')}`;
  let pending = sessionCache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        return await ort.InferenceSession.create(model, { executionProviders: providers });
      } catch (error) {
        if (providers.includes('webgpu')) {
          return ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
        }
        throw error;
      }
    })();
    sessionCache.set(key, pending);
  }
  return pending;
}

function errorCodeFor(error: unknown): InferenceErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('manifest')) return 'manifest';
  if (message.startsWith('descarga')) return 'download';
  if (message.includes('sha256')) return 'integrity';
  if (message.includes('OffscreenCanvas') || message.includes('createImageBitmap')) {
    return 'unsupported';
  }
  if (message.includes('decode') || message.includes('tensor') || message.includes('dims')) {
    return 'decode';
  }
  return 'runtime';
}

async function decodeBitmap(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

function drawTo(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  source?: PixelBox,
): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('OffscreenCanvas sin contexto 2d');
  context.fillStyle = `rgb(${PAD_VALUE},${PAD_VALUE},${PAD_VALUE})`;
  context.fillRect(0, 0, width, height);
  if (source) {
    context.drawImage(bitmap, source.x, source.y, source.w, source.h, 0, 0, width, height);
  } else {
    context.drawImage(bitmap, 0, 0, width, height);
  }
  return context.getImageData(0, 0, width, height).data;
}

function expand(box: PixelBox, margin: number, width: number, height: number): PixelBox {
  const dx = box.w * margin;
  const dy = box.h * margin;
  const x = Math.max(0, box.x - dx);
  const y = Math.max(0, box.y - dy);
  const w = Math.min(width - x, box.w + dx * 2);
  const h = Math.min(height - y, box.h + dy * 2);
  return { x, y, w, h };
}

async function runClassifier(
  ort: Runtime,
  session: Session,
  bitmap: ImageBitmap,
  box: PixelBox,
): Promise<TopKEntry[]> {
  const crop = expand(box, CROP_MARGIN, bitmap.width, bitmap.height);
  const rgba = drawTo(bitmap, CLASSIFIER_INPUT, CLASSIFIER_INPUT, crop);
  const tensor = new ort.Tensor(
    'float32',
    toNchw(rgba, CLASSIFIER_INPUT, CLASSIFIER_INPUT, IMAGENET_MEAN, IMAGENET_STD),
    [1, 3, CLASSIFIER_INPUT, CLASSIFIER_INPUT],
  );
  const input = session.inputNames[0];
  if (!input) throw new Error('decode: clasificador sin entrada');
  const outputs = await session.run({ [input]: tensor });
  const output = outputs[session.outputNames[0] ?? 'logits'];
  const logits = output?.data as ArrayLike<number> | undefined;
  if (!logits) throw new Error('decode: clasificador sin salida');
  return classify(logits, TOP_K).map((entry) => {
    const label = String(entry.index);
    const resolved = resolveClass(DEFAULT_CLASSMAP, label, CATALOG);
    return { label, classId: resolved ? resolved.food.id : null, p: entry.p };
  });
}

async function runDetector(
  ort: Runtime,
  session: Session,
  bitmap: ImageBitmap,
): Promise<PixelBox[]> {
  const geometry = letterboxGeometry(bitmap.width, bitmap.height, DETECTOR_INPUT, DETECTOR_INPUT);
  const canvas = new OffscreenCanvas(DETECTOR_INPUT, DETECTOR_INPUT);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('OffscreenCanvas sin contexto 2d');
  context.fillStyle = `rgb(${PAD_VALUE},${PAD_VALUE},${PAD_VALUE})`;
  context.fillRect(0, 0, DETECTOR_INPUT, DETECTOR_INPUT);
  context.drawImage(
    bitmap,
    geometry.offsetX,
    geometry.offsetY,
    bitmap.width * geometry.scale,
    bitmap.height * geometry.scale,
  );
  const rgba = context.getImageData(0, 0, DETECTOR_INPUT, DETECTOR_INPUT).data;
  const tensor = new ort.Tensor(
    'float32',
    toNchw(rgba, DETECTOR_INPUT, DETECTOR_INPUT, UNIT_MEAN, UNIT_STD),
    [1, 3, DETECTOR_INPUT, DETECTOR_INPUT],
  );
  const input = session.inputNames[0];
  if (!input) throw new Error('decode: detector sin entrada');
  const outputs = await session.run({ [input]: tensor });
  const output = outputs[session.outputNames[0] ?? 'output0'];
  if (!output) throw new Error('decode: detector sin salida');
  const dims = output.dims;
  const data = output.data as Float32Array;
  if (dims.length !== 3) throw new Error('decode: dims inesperadas del detector');
  const channels = dims[1] ?? 0;
  const anchors = dims[2] ?? 0;
  const numClasses = Math.max(1, channels - 4);
  const candidates = detect(data, anchors, numClasses, {
    scoreThreshold: SCORE_THRESHOLD,
    iouThreshold: IOU_THRESHOLD,
    maxDetections: MAX_DETECTIONS,
  });
  return candidates.map((candidate) => {
    const original = unletterboxBox(candidate.box, geometry);
    return normalizeBox(original, bitmap.width, bitmap.height);
  });
}

async function handleDetect(request: WorkerRequest & { type: 'detect' }): Promise<void> {
  const { id, manifestUrl, cacheName, image } = request;
  try {
    progress(id, 'manifest');
    const manifest = await fetchManifest(manifestUrl);

    progress(id, 'downloading');
    const detectorBytes = await loadAsset(manifest.detector, cacheName, (p) =>
      progress(id, 'downloading', p.loaded, p.total),
    );
    progress(id, 'verifying');
    if (!(await verifySha256(detectorBytes, manifest.detector.sha256))) {
      throw new Error('sha256 detector');
    }
    const classifierBytes = await loadAsset(manifest.classifier, cacheName, (p) =>
      progress(id, 'downloading', p.loaded, p.total),
    );
    if (!(await verifySha256(classifierBytes, manifest.classifier.sha256))) {
      throw new Error('sha256 clasificador');
    }

    progress(id, 'session');
    const { ort, providers, engine } = await getRuntime();
    const detector = await getSession(ort, providers, manifest.detector.url, detectorBytes);
    const classifier = await getSession(ort, providers, manifest.classifier.url, classifierBytes);
    if (cancelled.has(id)) {
      post({ type: 'cancelled', id });
      return;
    }

    progress(id, 'detecting');
    const bitmap = await decodeBitmap(image.dataUrl);
    const boxes = await runDetector(ort, detector, bitmap);

    progress(id, 'classifying');
    const results: DetectionResult[] = [];
    for (const box of boxes) {
      if (cancelled.has(id)) {
        post({ type: 'cancelled', id });
        bitmap.close();
        return;
      }
      const topk = await runClassifier(ort, classifier, bitmap, {
        x: box.x * bitmap.width,
        y: box.y * bitmap.height,
        w: box.w * bitmap.width,
        h: box.h * bitmap.height,
      });
      const best = topk[0];
      results.push({
        box,
        score: best?.p ?? 0,
        label: best?.label ?? 'desconocido',
        classId: best?.classId ?? null,
        topk,
      });
    }
    bitmap.close();
    post({
      type: 'result',
      id,
      engine,
      detector: manifest.detector.version,
      classifier: manifest.classifier.version,
      results,
    });
  } catch (error) {
    post({
      type: 'error',
      id,
      code: errorCodeFor(error),
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    cancelled.delete(id);
  }
}

scope.onmessage = (event) => {
  const request = event.data;
  if (!request) return;
  if (request.type === 'cancel') {
    cancelled.add(request.id);
    return;
  }
  if (request.type === 'detect') void handleDetect(request);
};

post({ type: 'ready' });
