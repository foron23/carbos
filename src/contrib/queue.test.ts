import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContributionRecord } from './queue';

interface MemoryStore {
  put(record: ContributionRecord): ContributionRecord;
  get(id: string): ContributionRecord | undefined;
  getAll(): ContributionRecord[];
  delete(id: string): void;
  clear(): void;
}

const mocks = vi.hoisted(() => {
  const stores = new Map<string, Map<string, ContributionRecord>>();
  const storeFor = (name: string): MemoryStore => {
    let map = stores.get(name);
    if (!map) {
      map = new Map<string, ContributionRecord>();
      stores.set(name, map);
    }
    const inner = map;
    return {
      put: (record) => {
        inner.set(record.id, record);
        return record;
      },
      get: (id) => inner.get(id),
      getAll: () => [...inner.values()],
      delete: (id) => {
        inner.delete(id);
      },
      clear: () => {
        inner.clear();
      },
    };
  };
  const tx = vi.fn(
    async (
      storeName: string,
      _mode: string,
      run: (store: MemoryStore) => unknown,
    ): Promise<unknown> => run(storeFor(storeName)),
  );
  return { stores, tx };
});

vi.mock('../core/db', () => ({
  STORE_CONTRIBUTIONS: 'contributions',
  tx: mocks.tx,
}));

import {
  addContribution,
  canRetry,
  clearContributions,
  listContributions,
  markFailed,
  markSent,
  pendingContributions,
  removeContribution,
} from './queue';

const blob = (): Blob => new Blob(['x']);

beforeEach(() => {
  mocks.stores.clear();
  mocks.tx.mockClear();
});

describe('addContribution', () => {
  it('crea un registro pending con id y createdAt', async () => {
    const record = await addContribution({ classId: 'clase-1', blob: blob() });
    expect(record.id).toEqual(expect.any(String));
    expect(record.id.length).toBeGreaterThan(0);
    expect(record.classId).toBe('clase-1');
    expect(record.status).toBe('pending');
    expect(record.attempts).toBe(0);
    expect(record.createdAt).toEqual(expect.any(Number));

    const all = await listContributions();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(record.id);
  });
});

describe('listContributions', () => {
  it('devuelve los registros ordenados por createdAt ascendente', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(300).mockReturnValueOnce(100).mockReturnValueOnce(200);
    await addContribution({ classId: 'a', blob: blob() });
    await addContribution({ classId: 'b', blob: blob() });
    await addContribution({ classId: 'c', blob: blob() });
    now.mockRestore();

    const all = await listContributions();
    expect(all.map((r) => r.createdAt)).toEqual([100, 200, 300]);
  });
});

describe('pendingContributions', () => {
  it('filtra los registros ya enviados', async () => {
    const first = await addContribution({ classId: 'a', blob: blob() });
    await addContribution({ classId: 'b', blob: blob() });
    await markSent(first.id);

    const pending = await pendingContributions();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe('pending');
  });
});

describe('markSent', () => {
  it('cambia el estado a sent sin tocar attempts', async () => {
    const record = await addContribution({ classId: 'a', blob: blob() });
    await markSent(record.id);
    const all = await listContributions();
    expect(all[0]?.status).toBe('sent');
    expect(all[0]?.attempts).toBe(0);
  });
});

describe('markFailed', () => {
  it('cambia el estado a failed e incrementa attempts', async () => {
    const record = await addContribution({ classId: 'a', blob: blob() });
    await markFailed(record.id);
    const all = await listContributions();
    expect(all[0]?.status).toBe('failed');
    expect(all[0]?.attempts).toBe(1);

    await markFailed(record.id);
    const again = await listContributions();
    expect(again[0]?.attempts).toBe(2);
  });
});

describe('removeContribution', () => {
  it('elimina el registro por id', async () => {
    const record = await addContribution({ classId: 'a', blob: blob() });
    await removeContribution(record.id);
    expect(await listContributions()).toHaveLength(0);
  });
});

describe('clearContributions', () => {
  it('vacia el almacen', async () => {
    await addContribution({ classId: 'a', blob: blob() });
    await addContribution({ classId: 'b', blob: blob() });
    await clearContributions();
    expect(await listContributions()).toHaveLength(0);
  });
});

describe('canRetry', () => {
  const base: ContributionRecord = {
    id: 'x',
    classId: 'a',
    blob: new Blob(['x']),
    createdAt: 0,
    status: 'pending',
    attempts: 0,
  };

  it('permite reintentar por debajo del maximo (3 por defecto)', () => {
    expect(canRetry({ ...base, attempts: 0 })).toBe(true);
    expect(canRetry({ ...base, attempts: 1 })).toBe(true);
    expect(canRetry({ ...base, attempts: 2 })).toBe(true);
    expect(canRetry({ ...base, attempts: 3 })).toBe(false);
  });

  it('respeta un maximo personalizado', () => {
    expect(canRetry({ ...base, attempts: 1 }, 2)).toBe(true);
    expect(canRetry({ ...base, attempts: 2 }, 2)).toBe(false);
  });

  it('nunca reintenta un registro enviado', () => {
    expect(canRetry({ ...base, status: 'sent', attempts: 0 })).toBe(false);
  });
});
