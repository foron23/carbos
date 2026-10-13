import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../model/loader';
import type { Fetcher } from '../model/loader';
import type { ChatManifest } from './manifest';
import type { ChatWorkerResponse } from './protocol';
import { handleChat } from './worker';

const MODEL_URL = 'https://cdn.example.com/chat/model.gguf';
const TOKENIZER_URL = 'https://cdn.example.com/chat/tokenizer.json';
const MANIFEST_URL = '/chat-manifest.json';

type ErrorMessage = Extract<ChatWorkerResponse, { type: 'error' }>;
type ResultMessage = Extract<ChatWorkerResponse, { type: 'result' }>;

async function makeAssets(): Promise<{ fetcher: Fetcher; manifest: ChatManifest }> {
  const bytes = new TextEncoder().encode('pesos-de-prueba');
  const hash = await sha256Hex(bytes.buffer);
  const manifest: ChatManifest = {
    model: { version: 'test-1', url: MODEL_URL, sha256: hash, bytes: bytes.byteLength },
    tokenizer: { version: 'tok-1', url: TOKENIZER_URL, sha256: hash, bytes: bytes.byteLength },
  };
  const fetcher: Fetcher = (input) => {
    if (input === MANIFEST_URL) return Promise.resolve(Response.json(manifest));
    if (input === MODEL_URL || input === TOKENIZER_URL) {
      return Promise.resolve(new Response(bytes.slice()));
    }
    return Promise.resolve(new Response('', { status: 404 }));
  };
  return { fetcher, manifest };
}

function collector(): {
  messages: ChatWorkerResponse[];
  post: (message: ChatWorkerResponse) => void;
} {
  const messages: ChatWorkerResponse[] = [];
  return { messages, post: (message) => messages.push(message) };
}

function request() {
  return {
    type: 'chat' as const,
    id: 1,
    manifestUrl: MANIFEST_URL,
    cacheName: 'carbos-chat-test',
    system: 'sistema',
    user: 'mensaje',
  };
}

describe('handleChat', () => {
  it('degrada en silencio si el import del runtime rechaza', async () => {
    const { fetcher } = await makeAssets();
    const { messages, post } = collector();

    await handleChat(request(), {
      post,
      fetcher,
      loadRuntime: () => Promise.reject(new Error('Cannot find module @huggingface/transformers')),
    });

    const error = messages.find((m): m is ErrorMessage => m.type === 'error');
    expect(error?.code).toBe('runtime');
    expect(messages.some((m) => m.type === 'result')).toBe(false);
  });

  it('devuelve el texto crudo del runtime cuando el import funciona', async () => {
    const { fetcher, manifest } = await makeAssets();
    const { messages, post } = collector();
    const runtime = {
      pipeline: () =>
        Promise.resolve(() => Promise.resolve([{ generated_text: '{"action":"unknown"}' }])),
    };

    await handleChat(request(), { post, fetcher, loadRuntime: () => Promise.resolve(runtime) });

    const result = messages.find((m): m is ResultMessage => m.type === 'result');
    expect(result?.text).toBe('{"action":"unknown"}');
    expect(result?.model).toBe(manifest.model.version);
    expect(messages.some((m) => m.type === 'error')).toBe(false);
  });

  it('emite progreso hasta la fase de generacion', async () => {
    const { fetcher } = await makeAssets();
    const { messages, post } = collector();
    const runtime = { pipeline: () => Promise.resolve(() => Promise.resolve('hola')) };

    await handleChat(request(), { post, fetcher, loadRuntime: () => Promise.resolve(runtime) });

    const phases = messages
      .filter((m) => m.type === 'progress')
      .map((m) => (m.type === 'progress' ? m.phase : ''));
    expect(phases).toContain('manifest');
    expect(phases).toContain('downloading');
    expect(phases).toContain('runtime');
    expect(phases).toContain('generating');
  });

  it('marca integrity si el sha256 no coincide', async () => {
    const { fetcher } = await makeAssets();
    const { messages, post } = collector();
    const badFetcher: Fetcher = (input) => {
      if (input === MANIFEST_URL) return fetcher(input);
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    };
    let runtimeLoaded = false;

    await handleChat(request(), {
      post,
      fetcher: badFetcher,
      loadRuntime: () => {
        runtimeLoaded = true;
        return Promise.resolve({});
      },
    });

    const error = messages.find((m): m is ErrorMessage => m.type === 'error');
    expect(error?.code).toBe('integrity');
    expect(runtimeLoaded).toBe(false);
  });
});
