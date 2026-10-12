import type { PixelBox } from './preprocess';

export type InferencePhase =
  'manifest' | 'downloading' | 'verifying' | 'session' | 'detecting' | 'classifying';

export type InferenceErrorCode =
  'manifest' | 'download' | 'integrity' | 'runtime' | 'decode' | 'unsupported';

export interface DetectionInput {
  dataUrl: string;
  width: number;
  height: number;
}

export interface TopKEntry {
  label: string;
  classId: string | null;
  p: number;
}

export interface DetectionResult {
  box: PixelBox;
  score: number;
  label: string;
  classId: string | null;
  topk: TopKEntry[];
}

export interface DetectRequest {
  type: 'detect';
  id: number;
  manifestUrl: string;
  cacheName: string;
  image: DetectionInput;
}

export interface CancelRequest {
  type: 'cancel';
  id: number;
}

export type WorkerRequest = DetectRequest | CancelRequest;

export interface ProgressMessage {
  type: 'progress';
  id: number;
  phase: InferencePhase;
  loaded: number;
  total: number;
}

export interface ResultMessage {
  type: 'result';
  id: number;
  engine: string;
  detector: string;
  classifier: string;
  results: DetectionResult[];
}

export interface ErrorMessage {
  type: 'error';
  id: number;
  code: InferenceErrorCode;
  message: string;
}

export type WorkerResponse =
  | ProgressMessage
  | ResultMessage
  | ErrorMessage
  | { type: 'ready' }
  | { type: 'cancelled'; id: number };
