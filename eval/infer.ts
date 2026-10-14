import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CATALOG } from '../src/catalog/catalog.ts';
import { DEFAULT_CLASSMAP, resolveClass } from '../src/catalog/classmap.ts';
import { classifyTopK } from '../src/model/labels.ts';
import { modelManifestSchema } from '../src/model/manifest.ts';
import type { ModelManifest } from '../src/model/manifest.ts';
import { detect } from '../src/model/detector.ts';
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
} from '../src/model/preprocess.ts';
import type { PixelBox } from '../src/model/preprocess.ts';
import { crop, decodePng, letterbox, resizeBilinear } from './image.ts';
import type { Rgba } from './image.ts';

const SCORE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const MAX_DETECTIONS = 12;
const TOP_K = 3;
const CROP_MARGIN = 0.1;

interface OrtTensor {
  data: Float32Array;
  dims: readonly number[];
}
interface OrtSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
}
interface OrtModule {
  InferenceSession: {
    create(buffer: Uint8Array, options?: { executionProviders?: string[] }): Promise<OrtSession>;
  };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
}

async function loadOrt(): Promise<OrtModule> {
  const mod = (await import('onnxruntime-node')) as { default?: OrtModule } & OrtModule;
  return mod.default ?? mod;
}

async function loadBytes(url: string, root: string): Promise<Uint8Array> {
  if (/^https?:/.test(url)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array(await readFile(join(root, url.replace(/^\//, ''))));
}

export async function loadManifest(pathOrUrl: string): Promise<ModelManifest> {
  const text = /^https?:/.test(pathOrUrl)
    ? await (await fetch(pathOrUrl)).text()
    : await readFile(pathOrUrl, 'utf8');
  return modelManifestSchema.parse(JSON.parse(text));
}

export interface Detection {
  box: PixelBox;
  score: number;
  label: string;
  classId: string | null;
  p: number;
  detectorClass: number;
}

function expand(box: PixelBox, margin: number, width: number, height: number): PixelBox {
  const dx = box.w * margin;
  const dy = box.h * margin;
  const x = Math.max(0, box.x - dx);
  const y = Math.max(0, box.y - dy);
  return { x, y, w: Math.min(width - x, box.w + dx * 2), h: Math.min(height - y, box.h + dy * 2) };
}

export class Inference {
  private constructor(
    private readonly ort: OrtModule,
    private readonly detector: OrtSession,
    private readonly classifier: OrtSession,
    private readonly classes: string[],
  ) {}

  static async create(manifest: ModelManifest, root: string): Promise<Inference> {
    const ort = await loadOrt();
    const options = { executionProviders: ['cpu'] };
    const detector = await ort.InferenceSession.create(
      await loadBytes(manifest.detector.url, root),
      options,
    );
    const classifier = await ort.InferenceSession.create(
      await loadBytes(manifest.classifier.url, root),
      options,
    );
    return new Inference(ort, detector, classifier, manifest.classifier.classes);
  }

  async run(rgba: Rgba): Promise<Detection[]> {
    const boxes = await this.detectBoxes(rgba);
    const detections: Detection[] = [];
    for (const { box, classIndex } of boxes) {
      const pixel: PixelBox = {
        x: box.x * rgba.width,
        y: box.y * rgba.height,
        w: box.w * rgba.width,
        h: box.h * rgba.height,
      };
      const region = crop(rgba, expand(pixel, CROP_MARGIN, rgba.width, rgba.height));
      const resized = resizeBilinear(region, CLASSIFIER_INPUT, CLASSIFIER_INPUT);
      const tensor = new this.ort.Tensor(
        'float32',
        toNchw(resized.data, CLASSIFIER_INPUT, CLASSIFIER_INPUT, IMAGENET_MEAN, IMAGENET_STD),
        [1, 3, CLASSIFIER_INPUT, CLASSIFIER_INPUT],
      );
      const input = this.classifier.inputNames[0];
      if (!input) throw new Error('clasificador sin entrada');
      const outputs = await this.classifier.run({ [input]: tensor });
      const output = outputs[this.classifier.outputNames[0] ?? 'logits'];
      if (!output) throw new Error('clasificador sin salida');
      const topk = classifyTopK(output.data, this.classes, TOP_K);
      const best = topk[0];
      detections.push({
        box,
        score: best?.p ?? 0,
        label: best?.label ?? 'desconocido',
        classId: best?.classId ?? null,
        p: best?.p ?? 0,
        detectorClass: classIndex,
      });
    }
    return detections;
  }

  private async detectBoxes(rgba: Rgba): Promise<{ box: PixelBox; classIndex: number }[]> {
    const geometry = letterboxGeometry(rgba.width, rgba.height, DETECTOR_INPUT, DETECTOR_INPUT);
    const padded = letterbox(rgba, DETECTOR_INPUT, PAD_VALUE);
    const tensor = new this.ort.Tensor(
      'float32',
      toNchw(padded.data, DETECTOR_INPUT, DETECTOR_INPUT, UNIT_MEAN, UNIT_STD),
      [1, 3, DETECTOR_INPUT, DETECTOR_INPUT],
    );
    const input = this.detector.inputNames[0];
    if (!input) throw new Error('detector sin entrada');
    const outputs = await this.detector.run({ [input]: tensor });
    const output = outputs[this.detector.outputNames[0] ?? 'output0'];
    if (!output) throw new Error('detector sin salida');
    const channels = output.dims[1] ?? 0;
    const anchors = output.dims[2] ?? 0;
    if (output.dims.length !== 3) throw new Error('dims inesperadas del detector');
    const numClasses = Math.max(1, channels - 4);
    const candidates = detect(output.data, anchors, numClasses, {
      scoreThreshold: SCORE_THRESHOLD,
      iouThreshold: IOU_THRESHOLD,
      maxDetections: MAX_DETECTIONS,
    });
    return candidates.map((candidate) => ({
      box: normalizeBox(unletterboxBox(candidate.box, geometry), rgba.width, rgba.height),
      classIndex: candidate.classIndex,
    }));
  }
}

/**
 * Estimacion del plato a partir de las detecciones.
 *
 * D1 (SPEC 18): la porcion de cada caja se reparte por **area** (share =
 * area_caja / area_total) en vez de sumar una porcion por defecto COMPLETA por
 * caja. Sumar por caja sobrecuenta cuando el modelo resuelve muchas cajas
 * (2,28 de media) y hacia que un modelo con cobertura alta empeorara el MAE
 * (student: 29,2 g -> 16,3 g con el reparto por area). Con una sola caja el
 * resultado no cambia.
 */
export function predictedCarbs(detections: Detection[]): {
  carbs: number;
  mass: number;
  resolved: number;
} {
  const items: { food: (typeof CATALOG.foods)[number]; area: number }[] = [];
  for (const detection of detections) {
    if (!detection.classId) continue;
    const food = CATALOG.foods.find((entry) => entry.id === detection.classId);
    if (!food) continue;
    items.push({ food, area: Math.max(0, detection.box.w * detection.box.h) });
  }
  return splitPlate(items);
}

/** Reparte una porcion de plato entre los items segun el area de su caja. */
function splitPlate(items: { food: (typeof CATALOG.foods)[number]; area: number }[]): {
  carbs: number;
  mass: number;
  resolved: number;
} {
  const totalArea = items.reduce((a, item) => a + item.area, 0);
  let carbs = 0;
  let mass = 0;
  for (const item of items) {
    const share = totalArea > 0 ? item.area / totalArea : 1 / items.length;
    const grams = item.food.defaultPortionGrams * share;
    mass += grams;
    carbs += (grams * item.food.carbsPer100g) / 100;
  }
  return { carbs, mass, resolved: items.length };
}

// Clases COCO (detector) que son comida y su nombre, para usar la clase del detector.
const COCO_FOOD_CLASS: Record<number, string> = {
  46: 'banana',
  47: 'apple',
  48: 'sandwich',
  49: 'orange',
  50: 'broccoli',
  51: 'carrot',
  52: 'hot dog',
  53: 'pizza',
  54: 'donut',
  55: 'cake',
};

/**
 * Variante experimental: si la caja la detecta el detector con una clase de comida COCO,
 * se usa esa clase (traducida por el mapa); si no, cae al clasificador de imagen.
 */
export function predictedCarbsDetector(detections: Detection[]): {
  carbs: number;
  mass: number;
  resolved: number;
} {
  const items: { food: (typeof CATALOG.foods)[number]; area: number }[] = [];
  for (const detection of detections) {
    const label = COCO_FOOD_CLASS[detection.detectorClass];
    const fromDetector = label ? resolveClass(DEFAULT_CLASSMAP, label, CATALOG) : null;
    const classId = fromDetector ? fromDetector.food.id : detection.classId;
    if (!classId) continue;
    const food = CATALOG.foods.find((entry) => entry.id === classId);
    if (!food) continue;
    items.push({ food, area: Math.max(0, detection.box.w * detection.box.h) });
  }
  return splitPlate(items);
}

export { decodePng };
