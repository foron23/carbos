export const DEFAULT_ENDPOINT = 'https://carbos-contrib.forondaiker.workers.dev/api/contrib';

export interface UploadResult {
  ok: boolean;
  id?: string;
  key?: string;
  error?: string;
}

export interface UploadOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  retries?: number;
  delayMs?: number;
}

interface ResponseBody {
  ok?: unknown;
  id?: unknown;
  key?: unknown;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBody(response: Response): Promise<ResponseBody | null> {
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === 'object' && parsed !== null) return parsed as ResponseBody;
    return null;
  } catch {
    return null;
  }
}

function success(body: ResponseBody): UploadResult {
  const result: UploadResult = { ok: true };
  if (typeof body.id === 'string') result.id = body.id;
  if (typeof body.key === 'string') result.key = body.key;
  return result;
}

export async function uploadBundle(zip: Blob, options: UploadOptions = {}): Promise<UploadResult> {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempts = Math.max(1, options.retries ?? 3);
  const baseDelay = options.delayMs ?? 500;
  let lastError = 'No se pudo subir el paquete';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await delay(baseDelay * 2 ** (attempt - 1));
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: zip,
      });

      if (!response.ok) {
        if (response.status >= 500) {
          lastError = `El servidor respondio ${response.status}`;
          continue;
        }
        return { ok: false, error: `El servidor rechazo la subida (${response.status})` };
      }

      const body = await readBody(response);
      if (body && body.ok === true) return success(body);
      return { ok: false, error: 'Respuesta invalida del servidor' };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Error de red';
    }
  }

  return { ok: false, error: lastError };
}
