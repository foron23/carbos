import { CATALOG } from '../catalog/catalog';
import { searchFoods } from '../catalog/search';
import type { Catalog, Food } from '../catalog/types';
import { dayCarbs, itemCarbs } from '../core/totals';
import type { FoodItem, InsulinKind, InsulinLog, Meal } from '../core/types';
import type { Locale } from '../i18n';
import type { ChatIntent } from './intent';

/**
 * Traduce una intencion validada a una **propuesta** en memoria (propose/execute).
 *
 * El `foodId` de un item sale **solo** de `searchFoods` del catalogo: el modelo nunca lo
 * propone. Si un `query` no casa, el item queda sin resolver y no se puede confirmar. Aqui no
 * se calcula ninguna dosis: `resolve.ts` **no** importa `src/insulin/arithmetic.ts`.
 */

export const DEFAULT_INSULIN_KIND: InsulinKind = 'bolus';

export interface ResolvedItem {
  query: string;
  foodId: string | null;
  name: string | null;
  grams: number;
  carbsPer100g: number | null;
  carbs: number;
}

export interface MealProposal {
  kind: 'meal';
  date: string;
  time: string;
  items: ResolvedItem[];
  resolved: number;
  unresolved: number;
  carbs: number;
}

export interface InsulinProposal {
  kind: 'insulin';
  date: string;
  time: string;
  units: number;
  insulinKind: InsulinKind;
}

export interface DateProposal {
  kind: 'date';
  date: string;
}

export interface TotalsProposal {
  kind: 'totals';
  date: string;
}

export interface UnknownProposal {
  kind: 'unknown';
}

export type Proposal =
  MealProposal | InsulinProposal | DateProposal | TotalsProposal | UnknownProposal;

export interface ResolveDeps {
  locale: Locale;
  /** Fecha que se esta viendo; por defecto de la propuesta cuando la intencion no la trae. */
  currentDate: string;
  /** Hora actual HH:MM; por defecto de la propuesta cuando la intencion no la trae. */
  nowTime: string;
  catalog?: Catalog;
}

function firstMatch(query: string, catalog: Catalog): Food | null {
  return searchFoods(query, 1, catalog)[0] ?? null;
}

function resolveMealItem(
  item: { query: string; grams?: number | undefined },
  locale: Locale,
  catalog: Catalog,
): ResolvedItem {
  const food = firstMatch(item.query, catalog);
  if (!food) {
    return {
      query: item.query,
      foodId: null,
      name: null,
      grams: item.grams ?? 0,
      carbsPer100g: null,
      carbs: 0,
    };
  }
  const grams = item.grams ?? food.defaultPortionGrams;
  const draft: FoodItem = {
    id: food.id,
    name: food.name[locale],
    grams,
    carbsPer100g: food.carbsPer100g,
  };
  return {
    query: item.query,
    foodId: food.id,
    name: food.name[locale],
    grams,
    carbsPer100g: food.carbsPer100g,
    carbs: itemCarbs(draft),
  };
}

/** Mapea la intencion a una propuesta resuelta contra el catalogo. */
export function resolveIntent(intent: ChatIntent, deps: ResolveDeps): Proposal {
  const catalog = deps.catalog ?? CATALOG;
  switch (intent.action) {
    case 'log_meal': {
      const items = intent.items.map((item) => resolveMealItem(item, deps.locale, catalog));
      const resolved = items.filter((item) => item.foodId !== null).length;
      return {
        kind: 'meal',
        date: intent.date ?? deps.currentDate,
        time: intent.time ?? deps.nowTime,
        items,
        resolved,
        unresolved: items.length - resolved,
        carbs: items.reduce((sum, item) => sum + item.carbs, 0),
      };
    }
    case 'log_insulin':
      return {
        kind: 'insulin',
        date: intent.date ?? deps.currentDate,
        time: intent.time ?? deps.nowTime,
        units: intent.units,
        insulinKind: intent.kind ?? DEFAULT_INSULIN_KIND,
      };
    case 'query_totals':
      return { kind: 'totals', date: intent.date ?? deps.currentDate };
    case 'set_date':
      return { kind: 'date', date: intent.date };
    default:
      return { kind: 'unknown' };
  }
}

/** Total de carbohidratos de un dia para responder `query_totals` (solo lectura). */
export function totalsForDate(meals: readonly Meal[], date: string): number {
  return dayCarbs(meals, date);
}

/**
 * Construye el borrador `Meal` de una propuesta de comida. Devuelve `null` si no es una
 * comida, si no hay items o si queda algun `query` sin resolver: nunca se escribe a medias.
 */
export function proposalToMeal(proposal: Proposal, newId: () => string): Meal | null {
  if (proposal.kind !== 'meal' || proposal.items.length === 0 || proposal.unresolved > 0) {
    return null;
  }
  const mealId = newId();
  const items: FoodItem[] = proposal.items.map((item) => ({
    id: newId(),
    name: item.name as string,
    grams: item.grams,
    carbsPer100g: item.carbsPer100g as number,
    classId: item.foodId as string,
  }));
  return {
    id: mealId,
    date: proposal.date,
    time: proposal.time,
    items,
    confidence: null,
    origin: 'manual',
  };
}

/** Construye el borrador `InsulinLog` de una propuesta de registro. */
export function proposalToInsulinLog(proposal: Proposal, newId: () => string): InsulinLog | null {
  if (proposal.kind !== 'insulin') return null;
  return {
    id: newId(),
    date: proposal.date,
    time: proposal.time,
    units: proposal.units,
    kind: proposal.insulinKind,
  };
}
