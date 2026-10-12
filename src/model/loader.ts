import { modelManifestSchema } from './manifest';
import type { ModelEntry, ModelManifest } from './manifest';

export interface ByteProgress {
  loaded: number;
  total: number;
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export async function verifySha256(data: ArrayBuffer, expected: string): Promise<boolean> {
  return (await sha256Hex(data)) === expected.toLowerCase();
}

export async function fetchManifest(url: string, fetcher: Fetcher = fetch): Promise<ModelManifest> {
  const response = await fetcher(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`manifest ${response.status}`);
  return modelManifestSchema.parse(await response.json());
}

export async function fetchWithProgress(
  url: string,
  onProgress: (progress: ByteProgress) => void,
  fetcher: Fetcher = fetch,
): Promise<ArrayBuffer> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`descarga ${response.status}`);
  const total = Number(response.headers.get('content-length') ?? 0);
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress({ loaded, total });
    }
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

async function openCache(name: string): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(name);
  } catch {
    return null;
  }
}

export async function loadAsset(
  entry: ModelEntry,
  cacheName: string,
  onProgress: (progress: ByteProgress) => void,
  fetcher: Fetcher = fetch,
): Promise<ArrayBuffer> {
  const cache = await openCache(cacheName);
  if (cache) {
    const hit = await cache.match(entry.url);
    if (hit) {
      const cached = await hit.arrayBuffer();
      if (await verifySha256(cached, entry.sha256)) return cached;
      await cache.delete(entry.url);
    }
  }
  const buffer = await fetchWithProgress(entry.url, onProgress, fetcher);
  if (!(await verifySha256(buffer, entry.sha256))) {
    throw new Error('sha256 no coincide con el manifest');
  }
  if (cache) {
    try {
      await cache.put(entry.url, new Response(buffer.slice(0)));
    } catch {
      /* cache llena o no disponible: seguimos con el buffer en memoria */
    }
  }
  return buffer;
}
