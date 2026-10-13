import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Frontera regulatoria (D8/D10/D12): ningun fichero bajo `src/barcode/**` puede
 * importar la aritmetica de insulina (`src/insulin/arithmetic`). Espejo de
 * `src/chat/boundary.test.ts`: si esta prueba falla, alguien ha acercado el
 * codigo de barras al camino del calculo.
 *
 * La deteccion es por resolucion de ruta, no por subcadena literal: cubre la
 * ruta relativa (con o sin extension), el especificador desnudo, `import()`,
 * `require()` y `export ... from`, ignorando comentarios.
 */

const here = dirname(fileURLToPath(import.meta.url)); // src/barcode
const SELF = resolve(fileURLToPath(import.meta.url));
const ARITHMETIC = resolve(here, '..', 'insulin', 'arithmetic'); // src/insulin/arithmetic
const SOURCE_EXTENSIONS = ['.ts', '.mts', '.tsx', '.cts', '.js', '.mjs', '.cjs', '.jsx'];

/** Quita comentarios de linea y bloque respetando el contenido de las cadenas. */
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

const SPECIFIER_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"`]([^'"`]+)['"`]/g,
  /\bexport\s+(?:type\s+)?[^'";]*?\sfrom\s+['"`]([^'"`]+)['"`]/g,
  /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
];

/** Todos los especificadores de import/require, ignorando comentarios. */
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

function reachesArithmetic(specifier: string, importerDir: string): boolean {
  if (specifier.startsWith('.')) {
    const resolved = resolve(importerDir, specifier);
    return (
      resolved === ARITHMETIC ||
      resolved.startsWith(ARITHMETIC + '.') ||
      resolved.startsWith(ARITHMETIC + sep)
    );
  }
  return /(^|\/)insulin\/arithmetic$/.test(specifier.replace(/\\/g, '/'));
}

/** Especificadores prohibidos hallados en `source`, resueltos desde `importerDir`. */
export function findForbiddenImports(source: string, importerDir: string): string[] {
  return importSpecifiers(source).filter((specifier) => reachesArithmetic(specifier, importerDir));
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

describe('frontera del codigo de barras con la aritmetica de insulina', () => {
  it('ningun fichero de src/barcode/** importa src/insulin/arithmetic', () => {
    const offenders = sourceFiles(here)
      .filter((file) => resolve(file) !== SELF)
      .map((file) => ({
        file,
        specifiers: findForbiddenImports(readFileSync(file, 'utf8'), dirname(file)),
      }))
      .filter((entry) => entry.specifiers.length > 0);
    expect(offenders).toEqual([]);
  });

  it('detecta la ruta, la extension, el desnudo y todas las formas de import', () => {
    expect(findForbiddenImports("import { x } from '../insulin/arithmetic';", here)).not.toEqual(
      [],
    );
    expect(findForbiddenImports("import 'insulin/arithmetic';", here)).not.toEqual([]);
    expect(findForbiddenImports("import '../insulin/arithmetic.ts';", here)).not.toEqual([]);
    expect(
      findForbiddenImports("const m = await import('../insulin/arithmetic');", here),
    ).not.toEqual([]);
    expect(findForbiddenImports("const m = require('insulin/arithmetic');", here)).not.toEqual([]);
    expect(findForbiddenImports("export * from '../insulin/arithmetic';", here)).not.toEqual([]);
  });

  it('no confunde una mencion en un comentario con un import', () => {
    expect(findForbiddenImports('// el barcode no importa ../insulin/arithmetic', here)).toEqual(
      [],
    );
    expect(findForbiddenImports("const note = 'import from ../insulin/arithmetic';", here)).toEqual(
      [],
    );
  });

  it('deja pasar imports legitimos del propio modulo', () => {
    expect(findForbiddenImports("import { t } from '../i18n';", here)).toEqual([]);
    expect(findForbiddenImports("import { normalizeEan } from './ean';", here)).toEqual([]);
  });

  it('encuentra ficheros que analizar (la prueba no es vacia)', () => {
    expect(sourceFiles(here).length).toBeGreaterThan(3);
  });
});
