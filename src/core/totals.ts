import type { FoodItem, Meal, MealSlot } from './types';

export function itemCarbs(item: FoodItem): number {
  return (item.grams * item.carbsPer100g) / 100;
}

export function mealCarbs(meal: Meal): number {
  return meal.items.reduce((sum, item) => sum + itemCarbs(item), 0);
}

export function mealsForDate(meals: readonly Meal[], date: string): Meal[] {
  return meals.filter((meal) => meal.date === date);
}

export function mealsForSlot(meals: readonly Meal[], date: string, slot: MealSlot): Meal[] {
  return meals.filter((meal) => meal.date === date && meal.slot === slot);
}

export function dayCarbs(meals: readonly Meal[], date: string): number {
  return mealsForDate(meals, date).reduce((sum, meal) => sum + mealCarbs(meal), 0);
}

export function slotCarbs(meals: readonly Meal[], date: string, slot: MealSlot): number {
  return mealsForSlot(meals, date, slot).reduce((sum, meal) => sum + mealCarbs(meal), 0);
}

export function weekCarbs(meals: readonly Meal[], startDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return meals
    .filter((meal) => {
      const t = Date.parse(`${meal.date}T00:00:00Z`);
      return t >= start && t < end;
    })
    .reduce((sum, meal) => sum + mealCarbs(meal), 0);
}

export function roundCarbs(value: number): number {
  return Math.round(value * 10) / 10;
}
