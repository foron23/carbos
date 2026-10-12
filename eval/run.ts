import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inference, decodePng, loadManifest, predictedCarbs } from './infer.ts';
import { summarize } from './metrics.ts';
import type { Row } from './metrics.ts';
import { loadTestDishes } from './nutrition5k.ts';
import type { Dish } from './nutrition5k.ts';

function arg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value ?? fallback;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadImageBytes(dish: Dish, cacheDir: string): Promise<Uint8Array | null> {
  const file = join(cacheDir, `${dish.id}.png`);
  if (await exists(file)) return new Uint8Array(await readFile(file));
  const response = await fetch(dish.imageUrl);
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, bytes);
  return bytes;
}

async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

async function main(): Promise<void> {
  const manifestPath = arg('--manifest', 'public/model-manifest.json');
  const root = arg('--root', 'public');
  const limit = Number(arg('--limit', '0')) || 0;
  const concurrency = Math.max(1, Number(arg('--concurrency', '4')) || 4);
  const outDir = arg('--out', 'eval/results');
  const cacheDir = arg('--cache', 'eval/cache/images');

  const manifest = await loadManifest(manifestPath);
  const inference = await Inference.create(manifest, root);

  let dishes = await loadTestDishes();
  if (limit > 0) dishes = dishes.slice(0, limit);
  console.log(`Platos a evaluar: ${dishes.length} (concurrencia ${concurrency})`);

  const rows: Row[] = [];
  let done = 0;
  let missing = 0;
  await pool(dishes, concurrency, async (dish) => {
    const bytes = await loadImageBytes(dish, cacheDir);
    if (!bytes) {
      missing += 1;
      return;
    }
    const rgba = decodePng(bytes);
    const detections = await inference.run(rgba);
    const { carbs, mass, resolved } = predictedCarbs(detections);
    rows.push({
      id: dish.id,
      trueCarb: dish.totalCarb,
      predCarb: carbs,
      trueMass: dish.totalMass,
      predMass: mass,
      detections: detections.length,
      resolved,
    });
    done += 1;
    if (done % 25 === 0) process.stdout.write('.');
  });
  process.stdout.write('\n');

  rows.sort((a, b) => a.id.localeCompare(b.id));
  const summary = summarize(rows);
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const result = {
    benchmark: 'nutrition5k',
    split: 'rgb_test_ids',
    date: stamp,
    evaluated: rows.length,
    missingImages: missing,
    concurrency,
    detector: {
      version: manifest.detector.version,
      sha256: manifest.detector.sha256,
      bytes: manifest.detector.bytes,
    },
    classifier: {
      version: manifest.classifier.version,
      sha256: manifest.classifier.sha256,
      bytes: manifest.classifier.bytes,
      classes: manifest.classifier.classes.length,
    },
    summary,
    rows,
  };
  const file = join(outDir, `nutrition5k-${manifest.classifier.version}-${stamp}.json`);
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`Evaluados: ${rows.length} (sin imagen: ${missing})`);
  console.log(
    `MAE carbohidratos: ${summary.maeCarb.toFixed(2)} g (${(summary.maeCarbPct * 100).toFixed(1)}%)`,
  );
  console.log(`IC95: [${summary.ciLow.toFixed(2)}, ${summary.ciHigh.toFixed(2)}] g`);
  console.log(
    `MAE masa: ${summary.maeMass.toFixed(2)} g   cobertura: ${(summary.coverage * 100).toFixed(1)}%`,
  );
  console.log(`Resultado: ${file}`);
}

void main();
