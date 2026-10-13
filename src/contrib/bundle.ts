export const CONTRIB_FORMAT = 'carbos-contrib';
export const CONTRIB_VERSION = 1;
export const CONTRIB_LICENSE = 'CC0-1.0';

export interface BundleImage {
  classId: string;
  data: Uint8Array;
}

export interface BundleMeta {
  appVersion: string;
  grantedAt: string;
}

const HASH_LENGTH = 16;
const STORED = 0;

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
    const index = (crc ^ byte) & 0xff;
    crc = ((CRC_TABLE[index] ?? 0) ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function sha256Prefix(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex.slice(0, HASH_LENGTH);
}

function startsWith(data: Uint8Array, prefix: number[]): boolean {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (data[i] !== prefix[i]) return false;
  }
  return true;
}

function extensionFor(data: Uint8Array): string {
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (
    startsWith(data, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(data.slice(8), [0x57, 0x45, 0x42, 0x50])
  )
    return 'webp';
  return 'jpg';
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

interface CentralRecord {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

function zip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const records: CentralRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    records.push({ nameBytes, crc, size, offset });
    localParts.push(
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(STORED),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      entry.data,
    );
    offset += 30 + nameBytes.length + size;
  }

  const cdOffset = offset;
  for (const record of records) {
    centralParts.push(
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(STORED),
      u16(0),
      u16(0),
      u32(record.crc),
      u32(record.size),
      u32(record.size),
      u16(record.nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(record.offset),
      record.nameBytes,
    );
  }
  const central = concat(centralParts);

  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(records.length),
    u16(records.length),
    u32(central.length),
    u32(cdOffset),
    u16(0),
  ]);

  return concat([...localParts, central, eocd]);
}

export async function buildBundle(images: BundleImage[], meta: BundleMeta): Promise<Blob> {
  const prepared = await Promise.all(
    images.map(async (image) => {
      const hash = await sha256Prefix(image.data);
      const ext = extensionFor(image.data);
      return {
        classId: image.classId,
        path: `images/${image.classId}/${hash}.${ext}`,
        data: image.data,
      };
    }),
  );

  const consent = {
    format: CONTRIB_FORMAT,
    version: CONTRIB_VERSION,
    license: CONTRIB_LICENSE,
    granted_at: meta.grantedAt,
    app_version: meta.appVersion,
    images: images.length,
  };

  let metadata = 'path,class_id\n';
  for (const item of prepared) metadata += `${item.path},${item.classId}\n`;

  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: 'consent.json', data: encoder.encode(JSON.stringify(consent)) },
    { name: 'metadata.csv', data: encoder.encode(metadata) },
    ...prepared.map((item) => ({ name: item.path, data: item.data })),
  ];

  return new Blob([zip(entries)], { type: 'application/zip' });
}
