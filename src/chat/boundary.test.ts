import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Frontera regulatoria: el chat **nunca** entra en el camino del calculo. Ningun fichero bajo
 * `src/chat/**` puede importar el modulo de insulina (`src/insulin/**`), y en particular el
 * barrel `src/insulin/index.ts` que reexporta `arithmetic` (D8/D10/D12;
 * `docs/specs/14-chat.md`). Si esta prueba falla, alguien ha acercado el chat a la aritmetica.
 *
 * La deteccion es **por resolucion de ruta**, no por subcadena literal: cubre el barrel
 * (`'../insulin'`), el fichero concreto (`'../insulin/arithmetic'`), cualquier ruta relativa que
 * resuelva bajo `src/insulin/`, el especificador desnudo (`'insulin'`), imports de efecto
 * secundario, `import()`, `require()` y `export ... from`, en `.ts` / `.mts` / `.tsx`. Los
 * comentarios se eliminan antes de buscar para no confundir prosa con codigo.
 */

const here = dirname(fileURLToPath(import.meta.url)); // src/chat
const SELF = resolve(fileURLToPath(import.meta.url));
const INSULIN_DIR = resolve(here, '..', 'insulin'); // src/insulin
const SOURCE_EXTENSIONS = ['.ts', '.mts', '.tsx', '.cts', '.js', '.mjs', '.cjs', '.jsx'];

/**
 * Quita comentarios de linea (`//`) y de bloque (`/* *\/`) respetando el contenido de las
 * cadenas, de modo que una mencion en documentacion no cuente como import.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const char = source[i] as string;
    const next = source[i + 1];
    if (quote) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (char === quote) quote = null;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      out += char;
      i += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}

/** Formas reales de importar: `import ... from`, import de efecto secundario, `export from`,
 * `import()` y `require()`. */
const SPECIFIER_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"`]([^'"`]+)['"`]/g,
  /\bexport\s+(?:type\s+)?[^'";]*?\sfrom\s+['"`]([^'"`]+)['"`]/g,
  /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
];

/** Todos los especificadores de import/require de un fuente, ignorando comentarios. */
export function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      if (match[1]) found.push(match[1]);
    }
  }
  return found;
}

function isInsideInsulin(path: string): boolean {
  return path === INSULIN_DIR || path.startsWith(INSULIN_DIR + sep);
}

/**
 * `true` si el especificador puede alcanzar `src/insulin/**`. Las rutas relativas se resuelven
 * desde el directorio del fichero que importa; los especificadores desnudos (`insulin`,
 * `insulin/arithmetic`, alias `.../insulin`) se reconocen por su forma.
 */
export function isForbiddenSpecifier(specifier: string, importerDir: string): boolean {
  if (specifier.startsWith('.')) {
    return isInsideInsulin(resolve(importerDir, specifier));
  }
  const normalized = specifier.replace(/\\/g, '/');
  return (
    normalized === 'insulin' ||
    normalized.startsWith('insulin/') ||
    normalized.includes('/insulin/') ||
    /(^|\/)insulin$/.test(normalized)
  );
}

/** Especificadores prohibidos hallados en `source`, resueltos desde `importerDir`. */
export function findForbiddenImports(source: string, importerDir: string): string[] {
  return importSpecifiers(source).filter((specifier) =>
    isForbiddenSpecifier(specifier, importerDir),
  );
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (SOURCE_EXTENSIONS.some((extension) => full.endsWith(extension))) {
      files.push(full);
    }
  }
  return files;
}

describe('frontera del chat con la aritmetica de insulina', () => {
  it('ningun fichero de src/chat/** importa el modulo de insulina', () => {
    const offenders = sourceFiles(here)
      .filter((file) => resolve(file) !== SELF)
      .map((file) => ({
        file,
        specifiers: findForbiddenImports(readFileSync(file, 'utf8'), dirname(file)),
      }))
      .filter((entry) => entry.specifiers.length > 0);
    expect(offenders).toEqual([]);
  });

  it('detecta el barrel, el fichero, el desnudo y todas las formas de import', () => {
    expect(findForbiddenImports("import { x } from '../insulin';", here)).not.toEqual([]);
    expect(findForbiddenImports("import { x } from '../insulin/arithmetic';", here)).not.toEqual(
      [],
    );
    expect(findForbiddenImports("import { x } from '../insulin/arithmetic.ts';", here)).not.toEqual(
      [],
    );
    expect(findForbiddenImports("import { x } from '../insulin/./arithmetic';", here)).not.toEqual(
      [],
    );
    expect(findForbiddenImports("import 'insulin';", here)).not.toEqual([]);
    expect(findForbiddenImports("import 'insulin/arithmetic';", here)).not.toEqual([]);
    expect(findForbiddenImports("import '../insulin';", here)).not.toEqual([]);
    expect(findForbiddenImports("const m = await import('../insulin');", here)).not.toEqual([]);
    expect(findForbiddenImports('const m = await import(`../insulin`);', here)).not.toEqual([]);
    expect(findForbiddenImports("const m = require('insulin/arithmetic');", here)).not.toEqual([]);
    expect(findForbiddenImports('const m = require(`insulin/arithmetic`);', here)).not.toEqual([]);
    expect(findForbiddenImports("export * from '../insulin';", here)).not.toEqual([]);
    expect(
      findForbiddenImports("export type { X } from '../insulin/arithmetic';", here),
    ).not.toEqual([]);
  });

  it('resuelve rutas relativas desde el directorio del fichero que importa', () => {
    const nested = resolve(here, 'nested', 'deeper');
    expect(findForbiddenImports("import { x } from '../../../insulin';", nested)).not.toEqual([]);
    expect(findForbiddenImports("import { x } from '../../chat/parse';", nested)).toEqual([]);
  });

  it('no confunde una mencion en un comentario con un import', () => {
    expect(findForbiddenImports('// el chat no importa ../insulin', here)).toEqual([]);
    expect(findForbiddenImports("// import { x } from '../insulin';", here)).toEqual([]);
    expect(findForbiddenImports("/* import { x } from '../insulin/arithmetic'; */", here)).toEqual(
      [],
    );
    expect(findForbiddenImports("const note = 'import from ../insulin';", here)).toEqual([]);
  });

  it('deja pasar imports legitimos del propio chat', () => {
    expect(findForbiddenImports("import { t } from '../i18n';", here)).toEqual([]);
    expect(findForbiddenImports("import { parse } from './parse';", here)).toEqual([]);
  });

  it('encuentra ficheros que analizar (la prueba no es vacia)', () => {
    expect(sourceFiles(here).length).toBeGreaterThan(5);
  });
});
