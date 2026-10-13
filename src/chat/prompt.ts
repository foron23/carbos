import { CATALOG } from '../catalog/catalog';
import type { Catalog } from '../catalog/types';
import type { Locale } from '../i18n';

/**
 * Construye los prompts (sistema + usuario) del chat on-device en ES/EN.
 *
 * El prompt es **puro texto** y no forma parte del i18n visible: enumera el vocabulario
 * cerrado de intenciones (ver `intent.ts`) y una lista acotada de nombres del catalogo como
 * pista. El modelo nunca recibe ni devuelve un `foodId`: solo una `query` en texto libre que
 * `resolve.ts` hara casar con el catalogo.
 */

/** Vocabulario cerrado: fuera de esta lista, la intencion es `unknown`. */
export const CHAT_ACTIONS = [
  'log_meal',
  'log_insulin',
  'query_totals',
  'set_date',
  'unknown',
] as const;

export type ChatAction = (typeof CHAT_ACTIONS)[number];

/** Numero maximo de nombres de alimentos que se anaden como pista. */
export const DEFAULT_HINT_LIMIT = 40;

export interface PromptInput {
  locale: Locale;
  text: string;
  today: string;
  catalog?: Catalog;
  hintLimit?: number;
}

export interface ChatPrompt {
  system: string;
  user: string;
}

interface TaxonomyLine {
  action: ChatAction;
  schema: string;
}

const TAXONOMY: readonly TaxonomyLine[] = [
  {
    action: 'log_meal',
    schema:
      '{"action":"log_meal","date?":"YYYY-MM-DD","time?":"HH:MM","items":[{"query":"text","grams?":number}]}',
  },
  {
    action: 'log_insulin',
    schema:
      '{"action":"log_insulin","date?":"YYYY-MM-DD","time?":"HH:MM","units":number,"kind?":"bolus|basal"}',
  },
  { action: 'query_totals', schema: '{"action":"query_totals","date?":"YYYY-MM-DD"}' },
  { action: 'set_date', schema: '{"action":"set_date","date":"YYYY-MM-DD"}' },
  { action: 'unknown', schema: '{"action":"unknown"}' },
];

/** Nombres de alimentos del catalogo (en el idioma pedido) como pista acotada. */
export function catalogHints(
  locale: Locale,
  catalog: Catalog = CATALOG,
  limit: number = DEFAULT_HINT_LIMIT,
): string[] {
  return catalog.foods.slice(0, Math.max(0, limit)).map((food) => food.name[locale]);
}

function buildSystem(locale: Locale, hints: string, today: string): string {
  const taxonomy = TAXONOMY.map((line) => `- ${line.action}: ${line.schema}`).join('\n');
  const noFoods = locale === 'en' ? '(no foods)' : '(sin alimentos)';
  const hintText = hints.length > 0 ? hints : noFoods;
  if (locale === 'en') {
    return [
      'You are the interpreter of an on-device carbohydrate diary. Turn the user message into exactly ONE JSON intent.',
      '',
      'CLOSED vocabulary (no other action exists):',
      taxonomy,
      '',
      'Rules:',
      '- Reply with ONLY the JSON object, with no text around it.',
      '- Do not add keys that are not in the schema. `query` is free text, never an id.',
      '- Insulin units are valid only if the user wrote them in their message.',
      '- Grams are optional and must not exceed 2000.',
      '- If unsure, reply {"action":"unknown"}.',
      '',
      'Catalog foods (use these names as `query`):',
      hintText,
      '',
      `Today: ${today}`,
    ].join('\n');
  }
  return [
    'Eres el interprete de un diario de carbohidratos en el dispositivo. Traduce el mensaje del usuario a UNA sola intencion JSON.',
    '',
    'Vocabulario CERRADO (no existe ninguna otra accion):',
    taxonomy,
    '',
    'Reglas:',
    '- Responde SOLO con el objeto JSON, sin texto alrededor.',
    '- No anadas claves que no esten en el esquema. La `query` es texto libre, nunca un id.',
    '- Las unidades de insulina solo son validas si el usuario las ha escrito en su mensaje.',
    '- Los gramos son opcionales y no pueden pasar de 2000.',
    '- Si no lo entiendes, responde {"action":"unknown"}.',
    '',
    'Alimentos del catalogo (usa estos nombres como `query`):',
    hintText,
    '',
    `Fecha de hoy: ${today}`,
  ].join('\n');
}

function buildUser(locale: Locale, text: string): string {
  return locale === 'en' ? `User message: ${text}` : `Mensaje del usuario: ${text}`;
}

/** Prompt completo para el modelo en el idioma pedido. */
export function buildChatPrompt(input: PromptInput): ChatPrompt {
  const catalog = input.catalog ?? CATALOG;
  const hintLimit = input.hintLimit ?? DEFAULT_HINT_LIMIT;
  const hints = catalogHints(input.locale, catalog, hintLimit);
  return {
    system: buildSystem(input.locale, hints.join(', '), input.today),
    user: buildUser(input.locale, input.text),
  };
}
