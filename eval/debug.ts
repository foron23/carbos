import { Inference, decodePng, loadManifest } from './infer.ts';
import { loadTestDishes } from './nutrition5k.ts';

const manifestPath = process.argv[2] ?? 'eval/cache/manifest-mobilenet_v2_food101.json';
const root = process.argv[3] ?? 'eval/cache';

const manifest = await loadManifest(manifestPath);
const inference = await Inference.create(manifest, root);
const dishes = await loadTestDishes();

let seen = 0;
for (const dish of dishes) {
  const response = await fetch(dish.imageUrl);
  if (!response.ok) continue;
  const rgba = decodePng(new Uint8Array(await response.arrayBuffer()));
  const detections = await inference.run(rgba);
  const top = detections
    .slice(0, 4)
    .map((d) => `${d.label}(${(d.p * 100).toFixed(0)}%)${d.classId ? `->${d.classId}` : ''}`)
    .join(' ');
  console.log(`${dish.id} trueCarb=${dish.totalCarb.toFixed(1)} dets=${detections.length} ${top}`);
  seen += 1;
  if (seen >= 10) break;
}
