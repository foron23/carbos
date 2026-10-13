import { describe, expect, it } from 'vitest';
import { LOCALES, STRINGS, isStringKey, t } from './index';

const CLAVES = Object.keys(STRINGS.es) as Array<keyof typeof STRINGS.es>;

/**
 * Palabras que en castellano llevan tilde. Si aparecen sin ella en una cadena
 * castellana, es un fallo de localizacion: el texto se escribio sin acentos.
 */
const SIN_ACENTO: Array<[string, string]> = [
  ['anadir', 'añadir'],
  ['anade', 'añade'],
  ['anadelo', 'añádelo'],
  ['medico', 'médico'],
  ['numeros', 'números'],
  ['contrasena', 'contraseña'],
  ['estimacion', 'estimación'],
  ['aritmetica', 'aritmética'],
  ['modulo', 'módulo'],
  ['catalogo', 'catálogo'],
  ['porcion', 'porción'],
  ['analitica', 'analítica'],
  ['correccion', 'corrección'],
  ['ningun', 'ningún'],
  ['dia', 'día'],
  ['aqui', 'aquí'],
  ['cuanta', 'cuánta'],
  ['usala', 'úsala'],
  ['guia', 'guía'],
  ['tambien', 'también'],
  ['ademas', 'además'],
  ['Que es', 'Qué es'],
];

/** Cadenas que pueden coincidir en los dos idiomas sin ser un fallo. */
const IGUALES_PERMITIDAS = new Set([
  'unit.grams',
  'unit.units',
  'label.total',
  'kind.basal',
  'diary.originManual',
]);

describe('cadenas de la interfaz', () => {
  it('los dos idiomas tienen exactamente las mismas claves', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.es).sort());
  });

  it('ninguna cadena esta vacia ni con espacios de sobra', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(STRINGS[locale])) {
        expect(value, `${locale}.${key} vacia`).not.toBe('');
        expect(value, `${locale}.${key} sin recortar`).toBe(value.trim());
      }
    }
  });

  it('el castellano no pierde las tildes', () => {
    const fallos: string[] = [];
    for (const [llana, acentuada] of SIN_ACENTO) {
      const patron = new RegExp(`\\b${llana}\\b`, 'u');
      for (const [key, value] of Object.entries(STRINGS.es)) {
        if (patron.test(value)) fallos.push(`${key}: deberia decir "${acentuada}"`);
      }
    }
    expect(fallos).toEqual([]);
  });

  it('todo esta traducido salvo prestamos y simbolos', () => {
    const sinTraducir = CLAVES.filter(
      (key) => !IGUALES_PERMITIDAS.has(key) && STRINGS.es[key] === STRINGS.en[key],
    );
    expect(sinTraducir).toEqual([]);
  });

  it('no queda ninguna clave de franja (slot) en ningun idioma', () => {
    for (const locale of LOCALES) {
      for (const key of Object.keys(STRINGS[locale])) {
        expect(key.startsWith('slot.'), `${locale}.${key} es una clave de franja`).toBe(false);
        expect(key, `${locale}.${key} no debe existir`).not.toBe('field.slot');
      }
    }
  });

  it('las claves nuevas de atajos y porciones existen en ambos idiomas', () => {
    const nuevas = [
      'button.half',
      'button.double',
      'button.change',
      'portion.small',
      'portion.medium',
      'portion.large',
    ] as const;
    for (const key of nuevas) {
      expect(isStringKey(key), `la clave ${key} debe existir`).toBe(true);
      for (const locale of LOCALES) {
        expect(t(locale, key), `${locale}.${key} falta`).not.toBe('');
      }
    }
  });

  it('reconoce las claves validas y rechaza el resto', () => {
    expect(isStringKey('app.title')).toBe(true);
    expect(isStringKey('clave.que.no.existe')).toBe(false);
  });

  it('t devuelve la cadena del idioma pedido', () => {
    expect(t('es', 'button.register')).toBe('Registrar');
    expect(t('en', 'button.register')).toBe('Log it');
    expect(t('es', 'onboarding.scopeTitle')).toBe('Qué es y qué no es');
  });
});
