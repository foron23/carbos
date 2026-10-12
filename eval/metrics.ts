export interface Row {
  id: string;
  trueCarb: number;
  predCarb: number;
  trueMass: number;
  predMass: number;
  detections: number;
  resolved: number;
}

export interface Summary {
  dishes: number;
  maeCarb: number;
  maeCarbPct: number;
  maeMass: number;
  coverage: number;
  ciLow: number;
  ciHigh: number;
}

function bootstrapCI(values: number[], iterations = 1000): [number, number] {
  const n = values.length;
  if (n === 0) return [0, 0];
  let seed = 123456789;
  const rand = () => {
    seed = (1103515245 * seed + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const means: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let sum = 0;
    for (let j = 0; j < n; j += 1) sum += values[Math.floor(rand() * n)] ?? 0;
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * iterations)] ?? 0, means[Math.floor(0.975 * iterations)] ?? 0];
}

export function summarize(rows: Row[]): Summary {
  const n = rows.length;
  if (n === 0) {
    return { dishes: 0, maeCarb: 0, maeCarbPct: 0, maeMass: 0, coverage: 0, ciLow: 0, ciHigh: 0 };
  }
  const errors = rows.map((row) => Math.abs(row.predCarb - row.trueCarb));
  const maeCarb = errors.reduce((a, b) => a + b, 0) / n;
  const meanTrue = rows.reduce((a, row) => a + row.trueCarb, 0) / n;
  const maeMass = rows.reduce((a, row) => a + Math.abs(row.predMass - row.trueMass), 0) / n;
  const detections = rows.reduce((a, row) => a + row.detections, 0);
  const resolved = rows.reduce((a, row) => a + row.resolved, 0);
  const [ciLow, ciHigh] = bootstrapCI(errors);
  return {
    dishes: n,
    maeCarb,
    maeCarbPct: meanTrue > 0 ? maeCarb / meanTrue : 0,
    maeMass,
    coverage: detections > 0 ? resolved / detections : 0,
    ciLow,
    ciHigh,
  };
}
