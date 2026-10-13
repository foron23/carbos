import { parseIntent } from './intent';
import type { ChatIntent } from './intent';

/**
 * Extrae y valida la intencion de la salida del modelo.
 *
 * Reglas (ver `docs/specs/14-chat.md`, "Guardas anti-alucinacion"):
 * 1. Se extrae el primer bloque JSON parseable (con fences ```json o sin ellos).
 * 2. Se valida con Zod (`.strict()`); cualquier fallo degrada a `{ action: 'unknown' }`.
 * 3. Las **unidades de insulina** solo se aceptan si el numero aparece **verbatim** en el
 *    mensaje del usuario; si el modelo se lo inventa, se degrada a `unknown`.
 *
 * Nunca se usa `eval` ni se acepta parcialmente un objeto roto.
 */

/** Representa "no se ha encontrado JSON"; `null` si es un JSON valido de valor nulo. */
export function extractJson(text: string): unknown {
  if (typeof text !== 'string' || text.length === 0) return undefined;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenced.exec(text)) !== null) {
    const parsed = tryParse(match[1] ?? '');
    if (parsed !== undefined) return parsed;
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char !== '{' && char !== '[') continue;
    const block = extractBalanced(text, i);
    if (block === null) continue;
    const parsed = tryParse(block);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function tryParse(candidate: string): unknown {
  try {
    return JSON.parse(candidate.trim());
  } catch {
    return undefined;
  }
}

/** Extrae la subcadena balanceada `{...}` / `[...]` desde `start`, respetando cadenas. */
function extractBalanced(text: string, start: number): string | null {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `true` si `value` aparece como numero literal en `text`. Se aceptan la forma con punto y
 * con coma decimal, y se exige que no sea parte de un numero mayor (p. ej. `6` no casa con
 * `16` ni con `0.6`).
 */
export function verbatimNumber(value: number, text: string): boolean {
  if (!Number.isFinite(value) || typeof text !== 'string') return false;
  const literal = String(value);
  const forms = new Set<string>([literal, literal.replace('.', ',')]);
  for (const form of forms) {
    const pattern = new RegExp(`(?<![0-9.,])${escapeRegExp(form)}(?![0-9])(?![.,][0-9])`, 'u');
    if (pattern.test(text)) return true;
  }
  return false;
}

/** Salida del modelo + mensaje original -> intencion validada (o `unknown`). */
export function parseModelOutput(modelText: string, userMessage: string): ChatIntent {
  const raw = extractJson(modelText);
  if (raw === undefined) return { action: 'unknown' };
  const intent = parseIntent(raw);
  if (intent.action === 'log_insulin' && !verbatimNumber(intent.units, userMessage)) {
    return { action: 'unknown' };
  }
  return intent;
}
