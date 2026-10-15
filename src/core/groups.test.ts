import { describe, expect, it } from 'vitest';
import { groupCarbs, groupChildren, groupMeals, groupTime, pruneGroups, ungroup } from './groups';
import type { GroupTimelineEntry } from './timeline';
import type { Meal, MealGroup } from './types';

function meal(id: string, date: string, time: string, carbsPer100g = 50, grams = 100): Meal {
  return {
    id,
    date,
    time,
    items: [{ id: `${id}-i`, name: 'alimento', grams, carbsPer100g }],
    confidence: null,
    origin: 'manual',
  };
}

describe('groups', () => {
  describe('criterio 5: validacion de groupMeals', () => {
    it('rechaza menos de 2 comidas', () => {
      expect(() => groupMeals([meal('a', '2026-10-12', '08:00')], ['a'])).toThrow();
      expect(() => groupMeals([meal('a', '2026-10-12', '08:00')], [])).toThrow();
    });

    it('rechaza ids desconocidos', () => {
      const meals = [meal('a', '2026-10-12', '08:00'), meal('b', '2026-10-12', '08:20')];
      expect(() => groupMeals(meals, ['a', 'zzz'])).toThrow();
    });

    it('rechaza comidas de dias distintos', () => {
      const meals = [meal('a', '2026-10-12', '08:00'), meal('b', '2026-10-13', '08:20')];
      expect(() => groupMeals(meals, ['a', 'b'])).toThrow();
    });

    it('rechaza ids repetidos (evita doble conteo)', () => {
      const meals = [meal('a', '2026-10-12', '08:00'), meal('b', '2026-10-12', '08:20')];
      expect(() => groupMeals(meals, ['a', 'a'], undefined, 'g')).toThrow();
    });

    it('acepta >=2 comidas del mismo dia y fija date = esa fecha', () => {
      const meals = [meal('a', '2026-10-12', '08:05'), meal('b', '2026-10-12', '08:20')];
      const group = groupMeals(meals, ['a', 'b'], 'Desayuno');
      expect(group.date).toBe('2026-10-12');
      expect(group.mealIds).toEqual(['a', 'b']);
      expect(group.name).toBe('Desayuno');
    });
  });

  describe('criterio 1: total derivado = suma de carbos de las hijas', () => {
    it('groupCarbs suma mealCarbs de las hijas', () => {
      const meals = [
        meal('a', '2026-10-12', '08:05', 50, 100), // 50 g
        meal('b', '2026-10-12', '08:20', 10, 200), // 20 g
      ];
      const group = groupMeals(meals, ['a', 'b']);
      expect(groupCarbs(group, meals)).toBe(70);
      // El total es derivado: no viaja en el grupo.
      expect(group).not.toHaveProperty('carbs');
      expect(group).not.toHaveProperty('total');
    });
  });

  describe('criterios 2/4: group/ungroup no destructivo e idempotente', () => {
    it('group/ungroup deja las comidas intactas', () => {
      const meals = [
        meal('a', '2026-10-12', '08:05'),
        meal('b', '2026-10-12', '08:20'),
        meal('c', '2026-10-12', '12:00'),
      ];
      const before = JSON.parse(JSON.stringify(meals)) as Meal[];
      const groups = [groupMeals(meals, ['a', 'b'], 'Desayuno')];
      const afterUngroup = ungroup(groups, groups[0]!.id);
      expect(afterUngroup).toEqual([]);
      expect(meals).toEqual(before);
    });

    it('ungroup solo quita el contenedor pedido', () => {
      const meals = [
        meal('a', '2026-10-12', '08:05'),
        meal('b', '2026-10-12', '08:20'),
        meal('c', '2026-10-12', '12:00'),
        meal('d', '2026-10-12', '12:30'),
      ];
      const g1 = groupMeals(meals, ['a', 'b'], undefined, 'g1');
      const g2 = groupMeals(meals, ['c', 'd'], undefined, 'g2');
      expect(ungroup([g1, g2], 'g1')).toEqual([g2]);
    });
  });

  describe('criterio 3: sin slot; hora = minima hija', () => {
    it('groupTime es la hora de la hija mas temprana', () => {
      const meals = [
        meal('a', '2026-10-12', '08:20'),
        meal('b', '2026-10-12', '08:05'),
        meal('c', '2026-10-12', '08:30'),
      ];
      const group = groupMeals(meals, ['a', 'b', 'c']);
      expect(groupTime(group, meals)).toBe('08:05');
    });

    it('groupTime vacio sin hijas', () => {
      const group = { id: 'g', date: '2026-10-12', mealIds: ['x', 'y'] };
      expect(groupTime(group, [])).toBe('');
      expect(groupChildren(group, [])).toEqual([]);
    });

    it('el grupo nunca lleva slot', () => {
      const meals = [meal('a', '2026-10-12', '08:05'), meal('b', '2026-10-12', '08:20')];
      const group = groupMeals(meals, ['a', 'b']);
      expect(Object.prototype.hasOwnProperty.call(group, 'slot')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(group, 'time')).toBe(false);
      const entry: GroupTimelineEntry = {
        kind: 'group',
        time: groupTime(group, meals),
        group,
        meals: groupChildren(group, meals),
      };
      expect(entry.kind).toBe('group');
      expect(entry.group).not.toHaveProperty('slot');
    });
  });

  describe('criterio 6: cascada con pruneGroups', () => {
    it('descarta grupos con menos de 2 hijas existentes', () => {
      const meals = [
        meal('a', '2026-10-12', '08:05'),
        meal('b', '2026-10-12', '08:20'),
        meal('c', '2026-10-12', '12:00'),
      ];
      const group = groupMeals(meals, ['a', 'b']);
      expect(pruneGroups([group], meals)).toEqual([group]);
      expect(
        pruneGroups(
          [group],
          meals.filter((m) => m.id !== 'b'),
        ),
      ).toEqual([]);
      expect(pruneGroups([group], [])).toEqual([]);
    });

    it('lectura tolerante: ignora hijas de otro dia y deduplica ids', () => {
      const meals = [meal('a', '2026-10-12', '08:05'), meal('b', '2026-10-13', '08:20')];
      const group: MealGroup = { id: 'g', date: '2026-10-12', mealIds: ['a', 'b', 'a'] };
      // La hija de otro dia no cuenta y el id repetido no dobla: queda 1 -> se poda.
      expect(groupChildren(group, meals).map((m) => m.id)).toEqual(['a']);
      expect(groupCarbs(group, meals)).toBe(50);
      expect(pruneGroups([group], meals)).toEqual([]);
    });
  });
});
