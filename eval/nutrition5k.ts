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

export async function loadTestDishes(fetcher: Fetcher = fetch): Promise<Dish[]> {
  const [meta1, meta2, split] = await Promise.all([
    getText(fetcher, `${BASE}/metadata/dish_metadata_cafe1.csv`),
    getText(fetcher, `${BASE}/metadata/dish_metadata_cafe2.csv`),
    getText(fetcher, `${BASE}/dish_ids/splits/rgb_test_ids.txt`),
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
