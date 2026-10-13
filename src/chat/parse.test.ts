import { describe, expect, it } from 'vitest';
import { extractJson, parseModelOutput, verbatimNumber } from './parse';

describe('extractJson', () => {
  it('extrae un bloque con fences ```json', () => {
    const text = 'Claro:\n```json\n{"action":"unknown"}\n```\n';
    expect(extractJson(text)).toEqual({ action: 'unknown' });
  });

  it('extrae un bloque con fences sin etiqueta', () => {
    const text = '```\n{"action":"query_totals"}\n```';
    expect(extractJson(text)).toEqual({ action: 'query_totals' });
  });

  it('extrae un objeto rodeado de prosa', () => {
    const text = 'Aqui tienes {"action":"set_date","date":"2026-10-13"} y ya esta.';
    expect(extractJson(text)).toEqual({ action: 'set_date', date: '2026-10-13' });
  });

  it('extrae un array JSON', () => {
    expect(extractJson('so: [1, {"a":2}]')).toEqual([1, { a: 2 }]);
  });

  it('devuelve undefined si no hay JSON', () => {
    expect(extractJson('no hay nada aqui')).toBeUndefined();
    expect(extractJson('')).toBeUndefined();
  });

  it('devuelve undefined con JSON roto o truncado', () => {
    expect(extractJson('{"action": "log_meal", "items": [')).toBeUndefined();
    expect(extractJson('{action: unknown}')).toBeUndefined();
  });

  it('ignora llaves dentro de cadenas', () => {
    const text = '{"action":"unknown","note":"usa { y } con cuidado"}';
    expect(extractJson(text)).toEqual({ action: 'unknown', note: 'usa { y } con cuidado' });
  });
});

describe('verbatimNumber', () => {
  it('acepta un numero presente literalmente', () => {
    expect(verbatimNumber(6, 'me puse 6 unidades')).toBe(true);
    expect(verbatimNumber(6.5, 'me puse 6.5')).toBe(true);
  });

  it('acepta la coma decimal', () => {
    expect(verbatimNumber(6.5, 'me puse 6,5')).toBe(true);
  });

  it('rechaza un numero ausente', () => {
    expect(verbatimNumber(6, 'me puse cinco')).toBe(false);
    expect(verbatimNumber(6.5, 'me puse 650')).toBe(false);
  });

  it('no casa con parte de un numero mayor', () => {
    expect(verbatimNumber(6, 'me puse 16')).toBe(false);
    expect(verbatimNumber(6, 'me puse 0.6')).toBe(false);
    expect(verbatimNumber(6, 'me puse 6,5')).toBe(false);
    expect(verbatimNumber(5, 'me puse 15')).toBe(false);
  });

  it('tolera puntuacion detras del numero', () => {
    expect(verbatimNumber(6, 'me puse 6.')).toBe(true);
    expect(verbatimNumber(6, 'me puse (6)')).toBe(true);
  });
});

describe('parseModelOutput', () => {
  it('devuelve la intencion valida de una comida', () => {
    const raw = '```json\n{"action":"log_meal","items":[{"query":"pan","grams":80}]}\n```';
    expect(parseModelOutput(raw, 'me comi pan')).toEqual({
      action: 'log_meal',
      items: [{ query: 'pan', grams: 80 }],
    });
  });

  it('degrada a unknown con JSON invalido o malformado', () => {
    expect(parseModelOutput('esto no es json', 'hola')).toEqual({ action: 'unknown' });
    expect(parseModelOutput('{"action": "log_meal"', 'hola')).toEqual({ action: 'unknown' });
  });

  it('degrada a unknown con una accion desconocida o una clave extra', () => {
    expect(parseModelOutput('{"action":"compute_insulin","carbs":45}', 'hola')).toEqual({
      action: 'unknown',
    });
    expect(
      parseModelOutput('{"action":"log_meal","items":[{"query":"pan"}],"units":6}', '6'),
    ).toEqual({ action: 'unknown' });
  });

  it('acepta log_insulin solo si el numero aparece verbatim', () => {
    const raw = '{"action":"log_insulin","units":6,"kind":"bolus"}';
    expect(parseModelOutput(raw, 'me puse 6 unidades')).toEqual({
      action: 'log_insulin',
      units: 6,
      kind: 'bolus',
    });
    expect(parseModelOutput(raw, 'me puse seis unidades')).toEqual({ action: 'unknown' });
    expect(parseModelOutput(raw, 'me puse 16 unidades')).toEqual({ action: 'unknown' });
  });

  it('no aplica la guarda verbatim a las intenciones que no son de insulina', () => {
    const raw = '{"action":"log_meal","items":[{"query":"pan","grams":80}]}';
    expect(parseModelOutput(raw, 'sin numeros').action).toBe('log_meal');
    expect(parseModelOutput('{"action":"query_totals"}', 'cuantos carbos llevo').action).toBe(
      'query_totals',
    );
  });
});
