import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENDPOINT, uploadBundle } from './upload';
import type { UploadOptions } from './upload';

type FetchLike = typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeFetch() {
  return vi.fn<FetchLike>();
}

function makeZip(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' });
}

function upload(fetchImpl: FetchLike, options: UploadOptions = {}) {
  return uploadBundle(makeZip(), { fetchImpl, delayMs: 0, ...options });
}

describe('uploadBundle', () => {
  it('sube el paquete con exito en una sola llamada', async () => {
    const fetchImpl = makeFetch();
    fetchImpl.mockResolvedValue(jsonResponse({ ok: true, id: 'abc', key: 'k/abc' }));

    const result = await upload(fetchImpl);

    expect(result).toEqual({ ok: true, id: 'abc', key: 'k/abc' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('agota reintentos ante errores 500', async () => {
    const fetchImpl = makeFetch();
    fetchImpl.mockResolvedValue(jsonResponse({ ok: false }, 500));

    const result = await upload(fetchImpl, { retries: 3 });

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('no reintenta ante 4xx', async () => {
    const fetchImpl = makeFetch();
    fetchImpl.mockResolvedValue(jsonResponse({ ok: false, error: 'bad' }, 400));

    const result = await upload(fetchImpl, { retries: 3 });

    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reintenta ante error de red y termina en fallo', async () => {
    const fetchImpl = makeFetch();
    fetchImpl.mockRejectedValue(new Error('network down'));

    const result = await upload(fetchImpl, { retries: 3 });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('network down');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('trata un body con ok:false como fallo sin reintentar', async () => {
    const fetchImpl = makeFetch();
    fetchImpl.mockResolvedValue(jsonResponse({ ok: false, error: 'rechazado' }));

    const result = await upload(fetchImpl, { retries: 3 });

    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('usa POST con Content-Type application/zip contra el endpoint por defecto', async () => {
    const fetchImpl = makeFetch();
    fetchImpl.mockResolvedValue(jsonResponse({ ok: true, id: 'x', key: 'y' }));

    await upload(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(DEFAULT_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/zip' });
  });

  it('respeta un endpoint alternativo', async () => {
    const fetchImpl = makeFetch();
    fetchImpl.mockResolvedValue(jsonResponse({ ok: true, id: 'x', key: 'y' }));

    await upload(fetchImpl, { endpoint: 'https://example.test/up' });

    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://example.test/up');
  });
});
