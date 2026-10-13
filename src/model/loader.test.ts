import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fetchJson, fetchManifest, loadAsset, sha256Hex, verifySha256 } from './loader';
import type { Fetcher } from './loader';

const hash = 'a'.repeat(64);

const manifest = {
  detector: {
    version: '1',
    url: 'https://cdn.example.com/detector.onnx',
    sha256: hash,
    bytes: 1024,
  },
  classifier: {
    version: '1',
    url: 'https://cdn.example.com/classifier.onnx',
    sha256: hash,
    bytes: 2048,
    classes: ['tortilla'],
  },
};

function responder(body: BodyInit, init?: ResponseInit): Fetcher {
  return () => Promise.resolve(new Response(body, init));
}

describe('sha256Hex', () => {
  it('coincide con el vector de "abc"', async () => {
    const data = new TextEncoder().encode('abc');
    expect(await sha256Hex(data.buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('verifySha256', () => {
  it('acepta el hash correcto y rechaza otro', async () => {
    const data = new TextEncoder().encode('abc').buffer;
    expect(
      await verifySha256(data, 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD'),
    ).toBe(true);
    expect(await verifySha256(data, hash)).toBe(false);
  });
});

describe('fetchManifest', () => {
  it('valida el manifest contra el esquema', async () => {
    const result = await fetchManifest('https://example.com/manifest.json', () =>
      Promise.resolve(Response.json(manifest)),
    );
    expect(result.classifier.classes).toEqual(['tortilla']);
  });

  it('lanza si el manifest no es valido', async () => {
    await expect(
      fetchManifest('https://example.com/manifest.json', () =>
        Promise.resolve(Response.json({ detector: manifest.detector })),
      ),
    ).rejects.toThrow();
  });
});

describe('fetchJson', () => {
  const schema = z.object({ name: z.string().min(1), bytes: z.number().int() }).strict();

  it('descarga y valida contra el esquema dado', async () => {
    const result = await fetchJson(
      'https://example.com/data.json',
      schema,
      responder(JSON.stringify({ name: 'chat', bytes: 7 })),
    );
    expect(result).toEqual({ name: 'chat', bytes: 7 });
  });

  it('lanza si la respuesta no es valida', async () => {
    await expect(
      fetchJson('https://example.com/data.json', schema, responder(JSON.stringify({ name: '' }))),
    ).rejects.toThrow();
  });

  it('lanza con el prefijo manifest si la respuesta no es ok', async () => {
    await expect(
      fetchJson(
        'https://example.com/data.json',
        schema,
        responder('nope', { status: 404, statusText: 'Not Found' }),
      ),
    ).rejects.toThrow(/manifest 404/);
  });
});

describe('loadAsset', () => {
  it('descarga y verifica el sha256', async () => {
    const body = new Uint8Array([1, 2, 3, 4]);
    const entry = { ...manifest.detector, sha256: await sha256Hex(body.buffer) };
    const result = await loadAsset(entry, 'carbos-test', () => {}, responder(body));
    expect(new Uint8Array(result)).toEqual(body);
  });

  it('aborta si el sha256 no coincide', async () => {
    const entry = { ...manifest.detector, sha256: hash };
    await expect(
      loadAsset(entry, 'carbos-test', () => {}, responder(new Uint8Array([9]))),
    ).rejects.toThrow(/sha256/);
  });
});
