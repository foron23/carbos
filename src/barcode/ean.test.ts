import { describe, expect, it } from 'vitest';
import { isValidEan13, normalizeEan } from './ean';

describe('isValidEan13', () => {
  it('acepta un EAN-13 valido', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
  });

  it('rechaza un digito de control incorrecto', () => {
    expect(isValidEan13('4006381333932')).toBe(false);
  });

  it('rechaza longitudes distintas de 13', () => {
    expect(isValidEan13('400638133393')).toBe(false);
    expect(isValidEan13('40063813339310')).toBe(false);
  });

  it('rechaza caracteres no numericos', () => {
    expect(isValidEan13('400638133393X')).toBe(false);
  });
});

describe('normalizeEan', () => {
  it('devuelve el EAN-13 tal cual si es valido', () => {
    expect(normalizeEan('4006381333931')).toBe('4006381333931');
  });

  it('convierte un UPC-A valido en EAN-13 con cero delante', () => {
    expect(normalizeEan('036000291452')).toBe('0036000291452');
  });

  it('elimina espacios en blanco', () => {
    expect(normalizeEan(' 4006381333931 ')).toBe('4006381333931');
  });

  it('rechaza un digito de control incorrecto', () => {
    expect(normalizeEan('4006381333932')).toBeNull();
    expect(normalizeEan('036000291453')).toBeNull();
  });

  it('rechaza longitudes no soportadas', () => {
    expect(normalizeEan('123')).toBeNull();
    expect(normalizeEan('400638133393')).toBeNull();
    expect(normalizeEan('40063813339310')).toBeNull();
    expect(normalizeEan('')).toBeNull();
  });

  it('rechaza entradas no numericas', () => {
    expect(normalizeEan('40063813339X1')).toBeNull();
    expect(normalizeEan('abcdefghijkl')).toBeNull();
  });
});
