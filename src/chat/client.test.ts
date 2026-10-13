import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatError, createChatClient } from './client';
import type { ChatWorkerRequest, ChatWorkerResponse } from './protocol';

type Listener = (event: { data: ChatWorkerResponse }) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly posted: ChatWorkerRequest[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  postMessage(message: ChatWorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(type: string, message: ChatWorkerResponse): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: message });
  }
}

function lastWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1);
  if (!worker) throw new Error('sin worker');
  return worker;
}

function requestId(worker: FakeWorker): number {
  const request = worker.posted.at(0);
  if (!request || request.type !== 'chat') throw new Error('sin peticion de chat');
  return request.id;
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createChatClient', () => {
  it('enruta la peticion por id y resuelve el texto', async () => {
    const client = createChatClient();
    const worker = lastWorker();
    const promise = client.chat('sistema', 'mensaje', { manifestUrl: '/m', cacheName: 'c' });

    const request = worker.posted.at(0);
    expect(request).toMatchObject({
      type: 'chat',
      id: 1,
      manifestUrl: '/m',
      cacheName: 'c',
      system: 'sistema',
      user: 'mensaje',
    });
    worker.emit('message', { type: 'result', id: 1, text: 'salida', model: 'v1' });

    await expect(promise).resolves.toEqual({ text: 'salida', model: 'v1' });
  });

  it('propaga el progreso al callback', async () => {
    const client = createChatClient();
    const worker = lastWorker();
    const onProgress = vi.fn();
    const promise = client.chat('a', 'b', { manifestUrl: '/m', cacheName: 'c' }, { onProgress });

    const id = requestId(worker);
    worker.emit('message', { type: 'progress', id, phase: 'downloading', loaded: 5, total: 10 });
    worker.emit('message', { type: 'result', id, text: 't', model: 'm' });
    await promise;

    expect(onProgress).toHaveBeenCalledWith({ phase: 'downloading', loaded: 5, total: 10 });
  });

  it('aborta posteando cancel y rechaza con AbortError', async () => {
    const client = createChatClient();
    const worker = lastWorker();
    const controller = new AbortController();
    const promise = client.chat('a', 'b', {
      manifestUrl: '/m',
      cacheName: 'c',
      signal: controller.signal,
    });

    const id = requestId(worker);
    controller.abort();
    expect(worker.posted.some((r) => r.type === 'cancel' && r.id === id)).toBe(true);

    worker.emit('message', { type: 'cancelled', id });
    await expect(promise).rejects.toHaveProperty('name', 'AbortError');
  });

  it('rechaza con ChatError cuando el worker responde error', async () => {
    const client = createChatClient();
    const worker = lastWorker();
    const promise = client.chat('a', 'b', { manifestUrl: '/m', cacheName: 'c' });

    const id = requestId(worker);
    worker.emit('message', { type: 'error', id, code: 'runtime', message: 'boom' });

    const error = await promise.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ChatError);
    expect((error as ChatError).code).toBe('runtime');
  });

  it('resuelve ready cuando el worker esta listo', async () => {
    const client = createChatClient();
    const worker = lastWorker();
    worker.emit('message', { type: 'ready' });
    await expect(client.ready).resolves.toBeUndefined();
  });

  it('dispose termina el worker', () => {
    const client = createChatClient();
    const worker = lastWorker();
    client.dispose();
    expect(worker.terminated).toBe(true);
  });
});
