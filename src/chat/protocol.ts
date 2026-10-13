/**
 * Protocolo del worker de chat (Fase 3 / v1.1). Es propio, separado de
 * `src/model/protocol.ts`: el chat no comparte tipos con la foto.
 *
 * El worker descarga los pesos (manifest + cache `carbos-chat-v1`), importa el runtime LLM en
 * diferido y devuelve el **texto** crudo del modelo. La extraccion y validacion de la intencion
 * (`parse.ts`, `intent.ts`) ocurren fuera del worker, en el hilo principal.
 */

export type ChatPhase = 'manifest' | 'downloading' | 'verifying' | 'runtime' | 'generating';

export type ChatErrorCode = 'manifest' | 'download' | 'integrity' | 'runtime' | 'unsupported';

export interface ChatRequest {
  type: 'chat';
  id: number;
  manifestUrl: string;
  cacheName: string;
  /** Prompt de sistema construido por `prompt.ts`. */
  system: string;
  /** Mensaje del usuario. */
  user: string;
}

export interface ChatCancelRequest {
  type: 'cancel';
  id: number;
}

export type ChatWorkerRequest = ChatRequest | ChatCancelRequest;

export interface ChatProgressMessage {
  type: 'progress';
  id: number;
  phase: ChatPhase;
  loaded: number;
  total: number;
}

export interface ChatResultMessage {
  type: 'result';
  id: number;
  /** Texto crudo del modelo; el parser lo convierte en intencion validada. */
  text: string;
  /** Version del modelo que lo genero (del manifest). */
  model: string;
}

export interface ChatErrorMessage {
  type: 'error';
  id: number;
  code: ChatErrorCode;
  message: string;
}

export type ChatWorkerResponse =
  | ChatProgressMessage
  | ChatResultMessage
  | ChatErrorMessage
  | { type: 'ready' }
  | { type: 'cancelled'; id: number };
