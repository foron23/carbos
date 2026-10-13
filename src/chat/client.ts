import type { ChatErrorCode, ChatPhase, ChatWorkerRequest, ChatWorkerResponse } from './protocol';

/**
 * Cliente del chat, espejo de `src/model/client.ts`: enruta por `id`, propaga progreso, soporta
 * `AbortSignal` y expone el estado `ready` del worker. No construye el worker hasta que se llama
 * a `createChatClient()`; el cableado (`setupChat`) solo lo llama si el chat esta habilitado y el
 * dispositivo es capaz, de modo que el chat desactivado no deja nodos ni peticiones.
 */

export interface ChatProgressEvent {
  phase: ChatPhase;
  loaded: number;
  total: number;
}

export interface ChatCallbacks {
  onProgress?: (event: ChatProgressEvent) => void;
}

export interface ChatOptions {
  manifestUrl: string;
  cacheName: string;
  signal?: AbortSignal;
}

export interface ChatOutcome {
  text: string;
  model: string;
}

export interface ChatClient {
  /** Se resuelve cuando el worker anuncia `ready`. */
  readonly ready: Promise<void>;
  chat(
    system: string,
    user: string,
    options: ChatOptions,
    callbacks?: ChatCallbacks,
  ): Promise<ChatOutcome>;
  dispose(): void;
}

export class ChatError extends Error {
  readonly code: ChatErrorCode;

  constructor(code: ChatErrorCode, message: string) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
  }
}

interface Pending {
  resolve: (outcome: ChatOutcome) => void;
  reject: (error: unknown) => void;
  callbacks: ChatCallbacks | undefined;
}

export function createChatClient(): ChatClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let markReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  worker.addEventListener('message', (event: MessageEvent<ChatWorkerResponse>) => {
    const message = event.data;
    if (!message) return;
    if (message.type === 'ready') {
      markReady();
      return;
    }
    if (message.type === 'cancelled' && !pending.has(message.id)) return;
    const entry = pending.get(message.id);
    if (!entry) return;

    if (message.type === 'progress') {
      entry.callbacks?.onProgress?.({
        phase: message.phase,
        loaded: message.loaded,
        total: message.total,
      });
      return;
    }
    pending.delete(message.id);
    if (message.type === 'result') {
      entry.resolve({ text: message.text, model: message.model });
      return;
    }
    if (message.type === 'cancelled') {
      entry.reject(new DOMException('cancelado', 'AbortError'));
      return;
    }
    entry.reject(new ChatError(message.code, message.message));
  });

  worker.addEventListener('error', () => {
    for (const entry of pending.values()) {
      entry.reject(new ChatError('runtime', 'fallo del worker de chat'));
    }
    pending.clear();
  });

  return {
    ready,
    chat(system, user, options, callbacks) {
      const id = nextId;
      nextId += 1;
      return new Promise<ChatOutcome>((resolve, reject) => {
        pending.set(id, { resolve, reject, callbacks });
        const request: ChatWorkerRequest = {
          type: 'chat',
          id,
          manifestUrl: options.manifestUrl,
          cacheName: options.cacheName,
          system,
          user,
        };
        options.signal?.addEventListener(
          'abort',
          () => worker.postMessage({ type: 'cancel', id } satisfies ChatWorkerRequest),
          { once: true },
        );
        worker.postMessage(request);
      });
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}
