import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Frontera (SPEC 27 / D72): el indicador de calidad del carbohidrato (y el
 * concepto de indice glucemico) **no** puede colarse en el camino del calculo
 * (`src/core/totals.ts`) ni en la aritmetica de insulina (`src/insulin/**`).
 *
 * Espejo de `src/chat/boundary.test.ts` y `src/barcode/boundary.test.ts`: si esta
 * prueba falla, alguien ha acercado el indicador al camino de la dosis o del
 * calculo. La comprobacion busca referencias al modulo `carbquality` en el codigo
 * (ignorando comentarios), no en los textos.
 */

const here = dirname(fileURLToPath(import.meta.url)); // src/core
const CORE = resolve(here, '..'); // src
const TOTALS = resolve(here, 'totals.ts');
const INSULIN_DIR = resolve(CORE, 'insulin');
const SOURCE_EXTENSIONS = ['.ts', '.mts', '.tsx', '.cts', '.js', '.mjs', '.cjs', '.jsx'];

/** Referencias al modulo del indicador (no a los textos de UI). */
const FORBIDDEN = /\bcarbQuality|\bcarbquality\b/;

const SIN_COMENTARIOS = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...sourceFiles(full));
    else if (SOURCE_EXTENSIONS.some((extension) => full.endsWith(extension))) files.push(full);
  }
  return files;
}

function offenders(files: string[]): string[] {
  return files.filter((file) => FORBIDDEN.test(SIN_COMENTARIOS(readFileSync(file, 'utf8'))));
}

describe('frontera del indicador con el calculo y la dosis', () => {
  it('el camino del calculo (src/core/totals.ts) no referencia el indicador', () => {
    expect(offenders([TOTALS])).toEqual([]);
  });

  it('la aritmetica de insulina (src/insulin/**) no referencia el indicador', () => {
    expect(offenders(sourceFiles(INSULIN_DIR))).toEqual([]);
  });

  it('la prueba no es vacia: hay ficheros que analizar', () => {
    expect(sourceFiles(INSULIN_DIR).length).toBeGreaterThan(0);
    expect(readFileSync(TOTALS, 'utf8').length).toBeGreaterThan(100);
  });
});
