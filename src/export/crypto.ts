import { argon2id } from 'hash-wasm';
import { z } from 'zod';
import { migrateVault } from '../core/migrate';
import { toJson } from '../core/export';
import type { Vault } from '../core/types';

export const ENC_FORMAT = 'carbos-enc';
export const ENC_VERSION = 1;

const kdfSchema = z.object({
  name: z.literal('argon2id'),
  salt: z.string().min(1),
  m: z.number().int().positive(),
  t: z.number().int().positive(),
  p: z.number().int().positive(),
});

export const envelopeSchema = z.object({
  format: z.literal(ENC_FORMAT),
  version: z.literal(ENC_VERSION),
  kdf: kdfSchema,
  cipher: z.literal('AES-GCM'),
  iv: z.string().min(1),
  data: z.string().min(1),
});

export type Envelope = z.infer<typeof envelopeSchema>;

const DEFAULT_M = 32768;
const DEFAULT_T = 3;
const DEFAULT_P = 1;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  kdf: Envelope['kdf'],
): Promise<CryptoKey> {
  const raw = await argon2id({
    password,
    salt,
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: 'binary',
  });
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export function isEncrypted(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { format?: unknown }).format === ENC_FORMAT
    );
  } catch {
    return false;
  }
}

export async function encryptVault(vault: Vault, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const kdf: Envelope['kdf'] = {
    name: 'argon2id',
    salt: bytesToBase64(salt),
    m: DEFAULT_M,
    t: DEFAULT_T,
    p: DEFAULT_P,
  };
  const key = await deriveKey(password, salt, kdf);
  const plaintext = new TextEncoder().encode(toJson(vault));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const envelope: Envelope = {
    format: ENC_FORMAT,
    version: ENC_VERSION,
    kdf,
    cipher: 'AES-GCM',
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipher)),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptVault(text: string, password: string): Promise<Vault> {
  const envelope = envelopeSchema.parse(JSON.parse(text));
  const salt = base64ToBytes(envelope.kdf.salt);
  const iv = base64ToBytes(envelope.iv);
  const key = await deriveKey(password, salt, envelope.kdf);
  const cipher = base64ToBytes(envelope.data);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  const decoded = new TextDecoder().decode(plain);
  return migrateVault(JSON.parse(decoded));
}
