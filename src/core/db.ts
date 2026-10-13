import type { InsulinLog, Meal, Vault } from './types';
import { SCHEMA_VERSION, emptyVault } from './types';
import { upgradeMeal } from './migrate';

const DB_NAME = 'carbos';
// El overlay de productos escaneados suma el store `products` (DB_VERSION 2 -> 3).
const DB_VERSION = 3;
const STORE_MEALS = 'meals';
const STORE_INSULIN = 'insulin';
const STORE_CONTRIBUTIONS = 'contributions';
const STORE_PRODUCTS = 'products';

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MEALS)) {
        db.createObjectStore(STORE_MEALS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_INSULIN)) {
        db.createObjectStore(STORE_INSULIN, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CONTRIBUTIONS)) {
        db.createObjectStore(STORE_CONTRIBUTIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        db.createObjectStore(STORE_PRODUCTS, { keyPath: 'barcode' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = run(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export function putMeal(meal: Meal): Promise<IDBValidKey> {
  return tx(STORE_MEALS, 'readwrite', (store) => store.put(meal));
}

export function putInsulin(log: InsulinLog): Promise<IDBValidKey> {
  return tx(STORE_INSULIN, 'readwrite', (store) => store.put(log));
}

/** Quita una comida registrada por id (el registro diario es editable). */
export function deleteMeal(id: string): Promise<void> {
  return tx<undefined>(STORE_MEALS, 'readwrite', (store) => store.delete(id)).then(() => undefined);
}

/** Quita un registro de insulina por id. */
export function deleteInsulin(id: string): Promise<void> {
  return tx<undefined>(STORE_INSULIN, 'readwrite', (store) => store.delete(id)).then(
    () => undefined,
  );
}

/**
 * Escribe muchos registros en UNA sola transaccion (importacion de packs). Evita
 * el coste de abrir/cerrar la base por cada fila cuando el pack trae miles.
 */
export function putAll(storeName: string, items: readonly unknown[]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        for (const item of items) store.put(item);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

export function allMeals(): Promise<Meal[]> {
  return tx<Meal[]>(STORE_MEALS, 'readonly', (store) => store.getAll());
}

export function allInsulin(): Promise<InsulinLog[]> {
  return tx<InsulinLog[]>(STORE_INSULIN, 'readonly', (store) => store.getAll());
}

export async function loadVault(): Promise<Vault> {
  const [meals, insulin] = await Promise.all([allMeals(), allInsulin()]);
  return { version: SCHEMA_VERSION, meals: meals.map(upgradeMeal), insulin };
}

export function replaceVault(vault: Vault): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_MEALS, STORE_INSULIN], 'readwrite');
        transaction.objectStore(STORE_MEALS).clear();
        transaction.objectStore(STORE_INSULIN).clear();
        for (const meal of vault.meals) transaction.objectStore(STORE_MEALS).put(meal);
        for (const log of vault.insulin) transaction.objectStore(STORE_INSULIN).put(log);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

export { emptyVault, STORE_CONTRIBUTIONS, STORE_PRODUCTS };
