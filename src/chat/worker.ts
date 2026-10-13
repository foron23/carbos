import { fetchJson, loadAsset, verifySha256 } from '../model/loader';
import type { Fetcher } from '../model/loader';
import { chatManifestSchema } from './manifest';
import type { ChatManifest } from './manifest';
import type { ChatErrorCode, ChatPhase, ChatWorkerRequest, ChatWorkerResponse } from './protocol';

/**
 * Worker del chat on-device (mismo patron que `src/model/worker.ts`, pero aislado).
 *
 * - Reutiliza `fetchJson`/`loadAsset`/`verifySha256` de `src/model/loader.ts`, con cache propio
 *   `carbos-chat-v1` (separado del cache de foto).
 * - El runtime LLM entra por **import dinamico** dentro de try/catch: si el import falla (pesos o
 *   runtime aun no publicados) el worker **degrada en silencio** posteando un error, sin dejar
 *   excepciones sin capturar. En esta fundacion **no** se anade una dependencia pesada a
 *   `package.json`; el especificador se resuelve en runtime cuando exista.
 * - El worker devuelve el **texto crudo**; la validacion de la intencion vive en el hilo principal.
 */

export const CHAT_CACHE = 'carbos-chat-v1';
export const RUNTIME_SPECIFIER = '@huggingface/transformers';

export interface ChatWorkerDeps {
  post: (message: ChatWorkerResponse) => void;
  fetcher?: Fetcher;
  loadManifest?: (url: string) => Promise<ChatManifest>;
  loadRuntime?: () => Promise<unknown>;
}

const cancelled = new Set<number>();

function postProgress(
  post: ChatWorkerDeps['post'],
  id: number,
  phase: ChatPhase,
  loaded = 0,
  total = 0,
): void {
  post({ type: 'progress', id, phase, loaded, total });
}

async function defaultLoadRuntime(): Promise<unknown> {
  return import(/* @vite-ignore */ RUNTIME_SPECIFIER);
}

interface ChatRuntime {
  pipeline?: (
    task: 'text-generation',
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

type TextPipeline = (
  messages: ChatMessage[],
  options?: Record<string, unknown>,
) => Promise<unknown>;

interface GenerateInput {
  system: string;
  user: string;
  modelUrl: string;
}

function generatedText(generated: unknown): string | null {
  if (typeof generated === 'string') return generated;
  if (Array.isArray(generated)) {
    const last = generated.at(-1);
    if (last && typeof last === 'object' && 'content' in last) {
      const content = (last as { content?: unknown }).content;
      if (typeof content === 'string') return content;
    }
  }
  return null;
}

function extractText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item && typeof item === 'object' && 'generated_text' in item) {
        const text = generatedText((item as { generated_text?: unknown }).generated_text);
        if (text !== null) return text;
      }
    }
  }
  throw new Error('runtime sin texto de salida');
}

async function generate(runtime: unknown, input: GenerateInput): Promise<string> {
  const mod = runtime as ChatRuntime | null;
  if (!mod || typeof mod.pipeline !== 'function') {
    throw new Error('runtime sin pipeline de generacion');
  }
  const pipe = await mod.pipeline('text-generation', input.modelUrl, { dtype: 'q4f16' });
  if (typeof pipe !== 'function') throw new Error('runtime sin generador de texto');
  const messages: ChatMessage[] = [
    { role: 'system', content: input.system },
    { role: 'user', content: input.user },
  ];
  const output = await (pipe as TextPipeline)(messages, {
    max_new_tokens: 256,
    do_sample: false,
  });
  return extractText(output);
}

function errorCodeFor(error: unknown): ChatErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith('manifest')) return 'manifest';
  if (message.startsWith('descarga')) return 'download';
  if (message.includes('sha256')) return 'integrity';
  if (message.includes('OffscreenCanvas') || message.includes('createImageBitmap')) {
    return 'unsupported';
  }
  return 'runtime';
}

export async function handleChat(
  request: ChatWorkerRequest & { type: 'chat' },
  deps: ChatWorkerDeps,
): Promise<void> {
  const { id, manifestUrl, cacheName, system, user } = request;
  const { post } = deps;
  const loadManifest =
    deps.loadManifest ?? ((url: string) => fetchJson(url, chatManifestSchema, deps.fetcher));
  const loadRuntime = deps.loadRuntime ?? defaultLoadRuntime;

  try {
    postProgress(post, id, 'manifest');
    const manifest = await loadManifest(manifestUrl);

    postProgress(post, id, 'downloading');
    const modelBytes = await loadAsset(
      manifest.model,
      cacheName,
      (progress) => postProgress(post, id, 'downloading', progress.loaded, progress.total),
      deps.fetcher,
    );
    postProgress(post, id, 'verifying');
    if (!(await verifySha256(modelBytes, manifest.model.sha256))) {
      throw new Error('sha256 modelo');
    }
    const tokenizerBytes = await loadAsset(
      manifest.tokenizer,
      cacheName,
      (progress) => postProgress(post, id, 'downloading', progress.loaded, progress.total),
      deps.fetcher,
    );
    if (!(await verifySha256(tokenizerBytes, manifest.tokenizer.sha256))) {
      throw new Error('sha256 tokenizer');
    }
    if (cancelled.has(id)) {
      post({ type: 'cancelled', id });
      return;
    }

    postProgress(post, id, 'runtime');
    const runtime = await loadRuntime();

    postProgress(post, id, 'generating');
    const text = await generate(runtime, { system, user, modelUrl: manifest.model.url });
    if (cancelled.has(id)) {
      post({ type: 'cancelled', id });
      return;
    }
    post({ type: 'result', id, text, model: manifest.model.version });
  } catch (error) {
    post({
      type: 'error',
      id,
      code: errorCodeFor(error),
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    cancelled.delete(id);
  }
}

export interface WorkerScope {
  onmessage: ((event: MessageEvent<ChatWorkerRequest>) => void) | null;
  postMessage: (message: ChatWorkerResponse) => void;
}

/** Conecta el worker al `self` del contexto. Separado para poder testear sin `self`. */
export function connectWorker(scope: WorkerScope, deps: Omit<ChatWorkerDeps, 'post'> = {}): void {
  scope.onmessage = (event) => {
    const request = event.data;
    if (!request) return;
    if (request.type === 'cancel') {
      cancelled.add(request.id);
      return;
    }
    if (request.type === 'chat') {
      void handleChat(request, { post: (message) => scope.postMessage(message), ...deps });
    }
  };
  scope.postMessage({ type: 'ready' });
}

const isWorkerScope =
  typeof self !== 'undefined' && typeof window === 'undefined' && typeof postMessage === 'function';

if (isWorkerScope) {
  connectWorker(self as unknown as WorkerScope);
}
