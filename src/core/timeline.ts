import { groupChildren, groupTime, pruneGroups } from './groups';
import type { InsulinLog, Meal, MealGroup } from './types';

export type MealTimelineEntry = { kind: 'meal'; time: string; meal: Meal };
export type InsulinTimelineEntry = { kind: 'insulin'; time: string; log: InsulinLog };
export type GroupTimelineEntry = { kind: 'group'; time: string; group: MealGroup; meals: Meal[] };

export type TimelineEntry = MealTimelineEntry | InsulinTimelineEntry | GroupTimelineEntry;

// Orden en empate de hora: comida, grupo y por ultimo insulina. Mantiene la
// regla "comida antes que insulina" y coloca el pliegue (grupo) junto a las comidas.
const KIND_ORDER: Record<TimelineEntry['kind'], number> = { meal: 0, group: 1, insulin: 2 };

export function compareTimeline(a: TimelineEntry, b: TimelineEntry): number {
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}

/** Llama a `dayTimeline` sin grupos: el resultado nunca trae entradas de grupo. */
export function dayTimeline(
  meals: readonly Meal[],
  insulin: readonly InsulinLog[],
  date: string,
): (MealTimelineEntry | InsulinTimelineEntry)[];
/** Llama a `dayTimeline` con grupos: pliega las comidas agrupadas del dia. */
export function dayTimeline(
  meals: readonly Meal[],
  insulin: readonly InsulinLog[],
  date: string,
  groups: readonly MealGroup[],
): TimelineEntry[];
export function dayTimeline(
  meals: readonly Meal[],
  insulin: readonly InsulinLog[],
  date: string,
  groups: readonly MealGroup[] = [],
): TimelineEntry[] {
  const groupedIds = new Set<string>();
  const groupEntries: TimelineEntry[] = [];
  for (const group of pruneGroups(groups, meals)) {
    if (group.date !== date) continue;
    const children = groupChildren(group, meals);
    for (const child of children) groupedIds.add(child.id);
    groupEntries.push({ kind: 'group', time: groupTime(group, meals), group, meals: children });
  }

  const entries: TimelineEntry[] = [
    ...meals
      .filter((meal) => meal.date === date && !groupedIds.has(meal.id))
      .map((meal): TimelineEntry => ({ kind: 'meal', time: meal.time, meal })),
    ...groupEntries,
    ...insulin
      .filter((log) => log.date === date)
      .map((log): TimelineEntry => ({ kind: 'insulin', time: log.time, log })),
  ];
  return entries.sort(compareTimeline);
}
