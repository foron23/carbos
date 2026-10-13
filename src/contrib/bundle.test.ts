import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTRIB_FORMAT, CONTRIB_LICENSE, CONTRIB_VERSION, buildBundle } from './bundle';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = ((CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

interface ParsedEntry {
  name: string;
  crc: number;
  size: number;
  data: Uint8Array;
}

function readZip(bytes: Uint8Array): ParsedEntry[] {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (readU32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('EOCD no encontrado');
  const total = readU16(bytes, eocd + 10);
  let at = readU32(bytes, eocd + 16);
  const decoder = new TextDecoder();
  const entries: ParsedEntry[] = [];
  for (let i = 0; i < total; i += 1) {
    if (readU32(bytes, at) !== 0x02014b50) throw new Error('firma de directorio central invalida');
    const crc = readU32(bytes, at + 16);
    const size = readU32(bytes, at + 20);
    const nameLen = readU16(bytes, at + 28);
    const extraLen = readU16(bytes, at + 30);
    const commentLen = readU16(bytes, at + 32);
    const localOffset = readU32(bytes, at + 42);
    const name = decoder.decode(bytes.slice(at + 46, at + 46 + nameLen));
    const localNameLen = readU16(bytes, localOffset + 26);
    const localExtraLen = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    entries.push({ name, crc, size, data: bytes.slice(dataStart, dataStart + size) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

const META = { appVersion: '1.2.3', grantedAt: '2026-10-13T10:00:00Z' };

async function asBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('bundle de contribuciones (zip STORE v1)', () => {
  it('empaqueta consent.json, metadata.csv e imagenes en orden', async () => {
    const blob = await buildBundle(
      [
        { classId: 'pan_blanco', data: JPEG },
        { classId: 'manzana', data: PNG },
      ],
      META,
    );
    expect(blob.type).toBe('application/zip');

    const bytes = await asBytes(blob);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const entries = readZip(bytes);
    expect(entries.map((entry) => entry.name)).toEqual([
      'consent.json',
      'metadata.csv',
      expect.stringMatching(/^images\/pan_blanco\/[0-9a-f]{16}\.jpg$/),
      expect.stringMatching(/^images\/manzana\/[0-9a-f]{16}\.png$/),
    ]);
    expect(entries).toHaveLength(4);

    for (const entry of entries) {
      expect(entry.crc).toBe(crc32(entry.data));
      expect(entry.size).toBe(entry.data.length);
    }

    const consent = JSON.parse(decode(entries[0]?.data ?? new Uint8Array()));
    expect(consent).toEqual({
      format: 'carbos-contrib',
      version: 1,
      license: 'CC0-1.0',
      granted_at: META.grantedAt,
      app_version: META.appVersion,
      images: 2,
    });

    const metadata = decode(entries[1]?.data ?? new Uint8Array());
    expect(metadata).toBe(
      `path,class_id\n${entries[2]?.name},pan_blanco\n${entries[3]?.name},manzana\n`,
    );

    expect(entries[2]?.data).toEqual(JPEG);
    expect(entries[3]?.data).toEqual(PNG);
  });

  it('detecta la extension por magic bytes y usa jpg por defecto', async () => {
    const blob = await buildBundle(
      [
        { classId: 'a', data: JPEG },
        { classId: 'b', data: PNG },
        { classId: 'c', data: WEBP },
        { classId: 'd', data: new Uint8Array([0x00, 0x01, 0x02]) },
      ],
      META,
    );
    const names = readZip(await asBytes(blob)).map((entry) => entry.name);
    expect(names[2]).toMatch(/\.jpg$/);
    expect(names[3]).toMatch(/\.png$/);
    expect(names[4]).toMatch(/\.webp$/);
    expect(names[5]).toMatch(/\.jpg$/);
  });

  it('los mismos bytes dan el mismo hash y el mismo path (dedupe)', async () => {
    const first = readZip(await asBytes(await buildBundle([{ classId: 'pan', data: JPEG }], META)));
    const second = readZip(
      await asBytes(await buildBundle([{ classId: 'pan', data: new Uint8Array(JPEG) }], META)),
    );
    expect(first[2]?.name).toBe(second[2]?.name);

    const doubled = readZip(
      await asBytes(
        await buildBundle(
          [
            { classId: 'pan', data: JPEG },
            { classId: 'pan', data: JPEG },
          ],
          META,
        ),
      ),
    );
    expect(doubled[2]?.name).toBe(doubled[3]?.name);
  });

  it('expone las constantes congeladas del formato v1', () => {
    expect(CONTRIB_FORMAT).toBe('carbos-contrib');
    expect(CONTRIB_VERSION).toBe(1);
    expect(CONTRIB_LICENSE).toBe('CC0-1.0');
  });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const IMPORTER = join(ROOT, 'tools', 'data', 'import_contributions.py');
const hasPython = spawnSync('python3', ['--version']).status === 0;

const ONE_PIXEL_JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
  ),
  (char) => char.charCodeAt(0),
);

const contract = hasPython ? it : it.skip;

describe('contrato con el receptor (import_contributions.py)', () => {
  contract('importa 1 imagen JPEG en dry-run', async () => {
    expect(existsSync(IMPORTER)).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'carbos-bundle-'));
    const zipPath = join(dir, 'contributions.zip');
    const blob = await buildBundle([{ classId: 'pan_blanco', data: ONE_PIXEL_JPEG }], META);
    writeFileSync(zipPath, new Uint8Array(await blob.arrayBuffer()));

    const result = spawnSync(
      'python3',
      [
        'tools/data/import_contributions.py',
        '--bundle',
        zipPath,
        '--out',
        join(dir, 'out'),
        '--log',
        join(dir, 'log.jsonl'),
        '--dry-run',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('importadas=1');
  });
});
