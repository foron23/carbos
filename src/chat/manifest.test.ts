import { describe, expect, it } from 'vitest';
import { chatManifestSchema } from './manifest';

const hash = 'a'.repeat(64);

const manifest = {
  model: {
    version: 'qwen2.5-1.5b-q4f16',
    url: 'https://cdn.jsdelivr.net/gh/foron23/carbos@chat-weights-1/weights/chat/model.gguf',
    sha256: hash,
    bytes: 1_234_567,
  },
  tokenizer: {
    version: 'qwen2.5-tokenizer',
    url: 'https://cdn.jsdelivr.net/gh/foron23/carbos@chat-weights-1/weights/chat/tokenizer.json',
    sha256: hash,
    bytes: 2048,
  },
};

describe('chat manifest', () => {
  it('acepta un manifest valido con model y tokenizer', () => {
    const parsed = chatManifestSchema.parse(manifest);
    expect(parsed.model.version).toBe('qwen2.5-1.5b-q4f16');
    expect(parsed.tokenizer.bytes).toBe(2048);
  });

  it('exige las dos entradas', () => {
    expect(() => chatManifestSchema.parse({ model: manifest.model })).toThrow();
    expect(() => chatManifestSchema.parse({ tokenizer: manifest.tokenizer })).toThrow();
  });

  it('reutiliza modelEntrySchema: sha256 en hex de 64 caracteres', () => {
    expect(() =>
      chatManifestSchema.parse({
        ...manifest,
        model: { ...manifest.model, sha256: 'zz' },
      }),
    ).toThrow();
  });

  it('reutiliza modelEntrySchema: bytes positivos', () => {
    expect(() =>
      chatManifestSchema.parse({
        ...manifest,
        tokenizer: { ...manifest.tokenizer, bytes: 0 },
      }),
    ).toThrow();
  });

  it('reutiliza modelEntrySchema: url valida', () => {
    expect(() =>
      chatManifestSchema.parse({
        ...manifest,
        model: { ...manifest.model, url: '/weights/chat/model.gguf' },
      }),
    ).not.toThrow();
    expect(() =>
      chatManifestSchema.parse({
        ...manifest,
        model: { ...manifest.model, url: 'no es una url' },
      }),
    ).toThrow();
  });
});
