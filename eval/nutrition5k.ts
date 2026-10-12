const BASE = 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset';

export interface Dish {
  id: string;
  totalMass: number;
  totalCarb: number;
  imageUrl: string;
}

type Fetcher = (input: string) => Promise<Response>;

export function parseMetadata(csv: string): Map<string, { mass: number; carb: number }> {
  const map = new Map<string, { mass: number; carb: number }>();
  for (const raw of csv.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('dish_')) continue;
    const fields = line.split(',');
    const id = fields[0] ?? '';
    const mass = Number(fields[2]);
    const carb = Number(fields[4]);
    if (id && Number.isFinite(mass) && Number.isFinite(carb)) map.set(id, { mass, carb });
  }
  return map;
}

export function parseSplit(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('dish_'));
}

async function getText(fetcher: Fetcher, url: string): Promise<string> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.text();
}

/**
 * Descarga (o lee de cache) un recurso de texto del dataset. La cache evita
 * volver a pedir los CSV de metadatos (el benchmark es reproducible offline).
 */
async function cachedText(fetcher: Fetcher, url: string, cacheDir?: string, name?: string) {
  if (cacheDir && name) {
    const { readFile, mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const file = join(cacheDir, name);
    try {
      return await readFile(file, 'utf8');
    } catch {
      const text = await getText(fetcher, url);
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, text, 'utf8');
      return text;
    }
  }
  return getText(fetcher, url);
}

export async function loadTestDishes(fetcher: Fetcher = fetch, cacheDir?: string): Promise<Dish[]> {
  const [meta1, meta2, split] = await Promise.all([
    cachedText(fetcher, `${BASE}/metadata/dish_metadata_cafe1.csv`, cacheDir, 'metadata/cafe1.csv'),
    cachedText(fetcher, `${BASE}/metadata/dish_metadata_cafe2.csv`, cacheDir, 'metadata/cafe2.csv'),
    cachedText(
      fetcher,
      `${BASE}/dish_ids/splits/rgb_test_ids.txt`,
      cacheDir,
      'metadata/rgb_test_ids.txt',
    ),
  ]);
  const meta = new Map([...parseMetadata(meta1), ...parseMetadata(meta2)]);
  const dishes: Dish[] = [];
  for (const id of parseSplit(split)) {
    const entry = meta.get(id);
    if (!entry) continue;
    dishes.push({
      id,
      totalMass: entry.mass,
      totalCarb: entry.carb,
      imageUrl: `${BASE}/imagery/realsense_overhead/${id}/rgb.png`,
    });
  }
  return dishes;
}
