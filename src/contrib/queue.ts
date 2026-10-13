import { STORE_CONTRIBUTIONS, tx } from '../core/db';

export type ContributionStatus = 'pending' | 'sent' | 'failed';

export interface ContributionRecord {
  id: string;
  classId: string;
  blob: Blob;
  createdAt: number;
  status: ContributionStatus;
  attempts: number;
}

export async function addContribution(input: {
  classId: string;
  blob: Blob;
}): Promise<ContributionRecord> {
  const record: ContributionRecord = {
    id: crypto.randomUUID(),
    classId: input.classId,
    blob: input.blob,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
  };
  await tx(STORE_CONTRIBUTIONS, 'readwrite', (store) => store.put(record));
  return record;
}

export function listContributions(): Promise<ContributionRecord[]> {
  return tx<ContributionRecord[]>(STORE_CONTRIBUTIONS, 'readonly', (store) => store.getAll()).then(
    (records) => records.sort((a, b) => a.createdAt - b.createdAt),
  );
}

export function pendingContributions(): Promise<ContributionRecord[]> {
  return listContributions().then((records) =>
    records.filter((record) => record.status === 'pending'),
  );
}

export function removeContribution(id: string): Promise<void> {
  return tx<undefined>(STORE_CONTRIBUTIONS, 'readwrite', (store) => store.delete(id)).then(
    () => undefined,
  );
}

export function clearContributions(): Promise<void> {
  return tx<undefined>(STORE_CONTRIBUTIONS, 'readwrite', (store) => store.clear()).then(
    () => undefined,
  );
}

function getContribution(id: string): Promise<ContributionRecord | undefined> {
  return tx<ContributionRecord | undefined>(STORE_CONTRIBUTIONS, 'readonly', (store) =>
    store.get(id),
  );
}

async function updateContribution(
  id: string,
  update: (record: ContributionRecord) => ContributionRecord,
): Promise<void> {
  const record = await getContribution(id);
  if (!record) return;
  await tx(STORE_CONTRIBUTIONS, 'readwrite', (store) => store.put(update(record)));
}

export function markSent(id: string): Promise<void> {
  return updateContribution(id, (record) => ({ ...record, status: 'sent' }));
}

export function markFailed(id: string): Promise<void> {
  return updateContribution(id, (record) => ({
    ...record,
    status: 'failed',
    attempts: record.attempts + 1,
  }));
}

export function canRetry(record: ContributionRecord, maxAttempts = 3): boolean {
  return record.status !== 'sent' && record.attempts < maxAttempts;
}
