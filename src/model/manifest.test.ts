import { describe, expect, it } from 'vitest';
import { modelManifestSchema } from './manifest';

const hash = 'a'.repeat(64);

const manifest = {
  detector: {
    version: '1',
    url: 'https://cdn.jsdelivr.net/gh/foron23/carbos-weights@1/detector.onnx',
    sha256: hash,
    bytes: 1024,
  },
  classifier: {
    version: '1',
    url: 'https://cdn.jsdelivr.net/gh/foron23/carbos-weights@1/classifier.onnx',
    sha256: hash,
    bytes: 2048,
    classes: ['tortilla'],
  },
};

describe('model manifest', () => {
  it('acepta un manifest valido', () => {
    expect(modelManifestSchema.parse(manifest).classifier.classes).toEqual(['tortilla']);
  });

  it('exige classes no vacias en el clasificador', () => {
    expect(() =>
      modelManifestSchema.parse({
        ...manifest,
        classifier: { ...manifest.classifier, classes: [] },
      }),
    ).toThrow();
  });

  it('exige sha256 en hex de 64 caracteres', () => {
    expect(() =>
      modelManifestSchema.parse({
        ...manifest,
        detector: { ...manifest.detector, sha256: 'zz' },
      }),
    ).toThrow();
  });

  it('exige bytes positivos', () => {
    expect(() =>
      modelManifestSchema.parse({
        ...manifest,
        detector: { ...manifest.detector, bytes: 0 },
      }),
    ).toThrow();
  });

  it('acepta una url relativa (mismo origen, smoke test local)', () => {
    expect(() =>
      modelManifestSchema.parse({
        ...manifest,
        detector: { ...manifest.detector, url: '/models/detector.onnx' },
      }),
    ).not.toThrow();
  });

  it('rechaza una url invalida', () => {
    expect(() =>
      modelManifestSchema.parse({
        ...manifest,
        detector: { ...manifest.detector, url: 'no es una url' },
      }),
    ).toThrow();
  });
});
