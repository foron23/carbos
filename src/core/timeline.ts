import type { InsulinLog, Meal } from './types';

export type TimelineEntry =
  { kind: 'meal'; time: string; meal: Meal } | { kind: 'insulin'; time: string; log: InsulinLog };

export function compareTimeline(a: TimelineEntry, b: TimelineEntry): number {
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  if (a.kind === b.kind) return 0;
  return a.kind === 'meal' ? -1 : 1;
}

export function dayTimeline(
  meals: readonly Meal[],
  insulin: readonly InsulinLog[],
  date: string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...meals
      .filter((meal) => meal.date === date)
      .map((meal): TimelineEntry => ({ kind: 'meal', time: meal.time, meal })),
    ...insulin
      .filter((log) => log.date === date)
      .map((log): TimelineEntry => ({ kind: 'insulin', time: log.time, log })),
  ];
  return entries.sort(compareTimeline);
}
