import { CATALOG } from './catalog';
import type { Catalog, Food } from './types';

/**
 * Categorias **curadas** del catalogo (D64) para explorar sin teclear. Viven
 * aparte del catalogo generado (`catalog.ts`), que **no se toca**. La clave de
 * cada categoria mapea a la cadena i18n `category.<clave>`.
 */
export const CATEGORIES = [
  'cereals',
  'potatoes',
  'legumes',
  'vegetables',
  'fruits',
  'dairy',
  'protein',
  'dishes',
  'sweets',
  'nuts',
  'sauces',
  'drinks',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Ids curados por categoria. Todo id del catalogo debe tener una (test). */
const CATEGORY_IDS: Record<Category, readonly string[]> = {
  cereals: [
    'pan_blanco',
    'pan_integral',
    'arroz_blanco',
    'arroz_integral',
    'arroz_basmati',
    'pasta_cocida',
    'pasta_integral',
    'quinoa',
    'avena',
    'copos_maiz',
    'muesli',
  ],
  potatoes: ['patata_cocida', 'patata_frita', 'pure_patata', 'boniato'],
  legumes: [
    'lentejas',
    'garbanzos',
    'judias_blancas',
    'judias_pintas',
    'guisantes',
    'habas',
    'judia_verde',
    'hummus',
    'soja',
  ],
  vegetables: [
    'tomate',
    'tomate_cherry',
    'lechuga',
    'cebolla',
    'ajo',
    'zanahoria',
    'pimiento_rojo',
    'pimiento_verde',
    'calabacin',
    'berenjena',
    'pepino',
    'brocoli',
    'coliflor',
    'espinacas',
    'champinon',
    'maiz_dulce',
    'calabaza',
    'puerro',
    'alcachofa',
    'esparragos',
    'aguacate',
    'aceitunas',
    'remolacha',
    'apio',
    'repollo',
    'col_lombarda',
    'acelgas',
    'nabos',
  ],
  fruits: [
    'manzana',
    'platano',
    'naranja',
    'mandarina',
    'pera',
    'uva',
    'fresa',
    'sandia',
    'melon',
    'kiwi',
    'pina',
    'melocoton',
    'albaricoque',
    'ciruela',
    'cereza',
    'mango',
    'higo',
    'granada',
    'limon',
    'datil',
    'pasas',
    'frambuesa',
    'arandano',
    'pomelo',
    'nectarina',
    'papaya',
  ],
  dairy: [
    'leche_entera',
    'leche_semidesnatada',
    'leche_desnatada',
    'yogur_natural',
    'yogur_griego',
    'yogur_frutas',
    'queso_fresco',
    'queso_curado',
    'mozzarella',
    'petit_suisse',
    'nata',
    'mantequilla',
    'flan',
    'natillas',
  ],
  protein: [
    'huevo',
    'pollo_pechuga',
    'pollo_muslo',
    'ternera',
    'cerdo',
    'pavo',
    'atun',
    'salmon',
    'sardina',
    'gambas',
    'jamon_serrano',
    'jamon_cocido',
    'chorizo',
  ],
  dishes: [
    'tortilla_patatas',
    'tortilla_francesa',
    'paella',
    'gazpacho',
    'croquetas',
    'pizza',
    'lasana',
    'canelones',
    'espaguetis_bolonesa',
    'sopa_fideos',
    'crema_verduras',
    'fabada',
    'pisto',
    'empanadilla',
    'sandwich_mixto',
    'hamburguesa',
    'albondigas',
    'cocido',
    'cuscus',
    'arroz_tres_delicias',
    'arroz_con_pollo',
    'estofado_ternera',
    'ternera_borgonona',
    'pollo_vasca',
    'guiso_cordero',
    'tajin',
    'musaka',
    'pastel_carne',
    'pasta_horno',
    'patatas_graten',
    'raviolis',
    'sushi',
    'chili',
    'pollo_al_vino',
    'callos',
    'verdura_gratinada',
    'salmorejo',
    'ajoblanco',
    'marmitako',
    'zarzuela',
    'rabo_toro',
    'migas',
    'huevos_rotos',
    'patatas_bravas',
    'arroz_cubana',
    'lacon_grelos',
    'empanada_gallega',
    'sopa_castellana',
  ],
  sweets: [
    'arroz_leche',
    'chocolate_negro',
    'chocolate_leche',
    'chocolate_blanco',
    'crema_cacao',
    'galletas',
    'galleta_chocolate',
    'croissant',
    'magdalena',
    'bizcocho',
    'brioche',
    'donut',
    'tarta_queso',
    'helado',
    'azucar',
    'miel',
    'mermelada',
    'turron',
  ],
  nuts: ['nueces', 'almendras', 'avellanas', 'cacahuetes'],
  sauces: ['tomate_frito', 'mayonesa', 'ketchup', 'aceite_oliva', 'aceite_girasol'],
  drinks: ['zumo_naranja', 'zumo_manzana', 'zumo_pina', 'limonada', 'refresco_cola', 'cerveza'],
};

const ID_TO_CATEGORY: ReadonlyMap<string, Category> = (() => {
  const map = new Map<string, Category>();
  for (const category of CATEGORIES) {
    for (const id of CATEGORY_IDS[category]) map.set(id, category);
  }
  return map;
})();

const CATEGORY_SETS: ReadonlyMap<Category, ReadonlySet<string>> = new Map(
  CATEGORIES.map((category) => [category, new Set(CATEGORY_IDS[category])]),
);

/** Categoria curada de un alimento del catalogo (`null` si no esta). */
export function categoryOf(id: string): Category | null {
  return ID_TO_CATEGORY.get(id) ?? null;
}

/**
 * Total de entradas curadas (suma, no el tamano del mapa): con la paridad
 * comprobada, igualar el tamano del catalogo prueba que no hay ids repetidos ni
 * de mas (ver test).
 */
export function curatedIdCount(): number {
  return CATEGORIES.reduce((total, category) => total + CATEGORY_IDS[category].length, 0);
}

/** Los alimentos del catalogo de una categoria, en orden de catalogo. */
export function foodsByCategory(category: Category, catalog: Catalog = CATALOG): Food[] {
  const ids = CATEGORY_SETS.get(category);
  if (!ids) return [];
  return catalog.foods.filter((food) => ids.has(food.id));
}
