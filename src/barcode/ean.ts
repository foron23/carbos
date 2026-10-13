/**
 * Normalizacion y validacion de EAN-13 / UPC-A.
 *
 * UPC-A (12 digitos) se interpreta como EAN-13 con un `0` delante; el digito de
 * control se valida siempre sobre los 13 digitos resultantes. Puro y sin estado.
 */

/** Digito de control mod-10 para los datos sin el check (pesos 1,3,1,3...). */
function checkDigitFor(data: string): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const digit = data.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** `true` si `code` es un EAN-13 numerico de 13 digitos con check valido. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return checkDigitFor(code.slice(0, 12)) === code.charCodeAt(12) - 48;
}

/**
 * Normaliza una entrada a EAN-13: quita espacios, acepta 12 (UPC-A, se antepone `0`)
 * o 13 digitos y valida el check. Devuelve `null` ante cualquier entrada invalida.
 */
export function normalizeEan(input: string): string | null {
  const compact = input.replace(/\s+/g, '');
  if (compact.length === 12) {
    const candidate = `0${compact}`;
    return isValidEan13(candidate) ? candidate : null;
  }
  if (compact.length === 13) {
    return isValidEan13(compact) ? compact : null;
  }
  return null;
}
