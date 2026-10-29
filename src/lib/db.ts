import type { DataSet, StoreName } from './exportImport';
import { STORE_NAMES, emptyDataSet, normalizeFoodEntry } from './exportImport';
import type { FoodEntry } from './types';

export const DB_NAME = 'tally-fitness';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support IndexedDB, so records can’t be saved.'));
      return;
    }
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = (ev) => {
      const db = open.result;
      // Version 1 schema. Future versions add migrations here keyed on ev.oldVersion;
      // never delete stores holding user data.
      if (ev.oldVersion < 1) {
        db.createObjectStore('profiles', { keyPath: 'id' });
        for (const s of ['foodEntries', 'customFoods', 'savedMeals', 'exerciseEntries', 'weightEntries', 'goalHistory', 'dayStatus']) {
          const store = db.createObjectStore(s, { keyPath: 'id' });
          store.createIndex('profileId', 'profileId', { unique: false });
          if (s !== 'customFoods' && s !== 'savedMeals') store.createIndex('profileDate', ['profileId', s === 'goalHistory' ? 'effectiveDate' : 'date'], { unique: false });
        }
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => db.close(); // let a newer tab upgrade
      resolve(db);
    };
    open.onerror = () => reject(open.error ?? new Error('Couldn’t open the local database.'));
    open.onblocked = () => reject(new Error('The database is open in an older tab. Close other Tally tabs and reload.'));
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return req(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function getByProfile<T>(store: StoreName, profileId: string): Promise<T[]> {
  const db = await openDb();
  return req(db.transaction(store).objectStore(store).index('profileId').getAll(profileId)) as Promise<T[]>;
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(store === 'foodEntries' ? normalizeFoodEntry(value as unknown as FoodEntry) : value);
  await done(tx);
}

export async function putMany(writes: Partial<Record<StoreName, unknown[]>>): Promise<void> {
  const names = Object.keys(writes) as StoreName[];
  if (!names.length) return;
  const db = await openDb();
  const tx = db.transaction(names, 'readwrite');
  for (const s of names) for (const v of writes[s] ?? []) tx.objectStore(s).put(v);
  await done(tx);
}

export async function remove(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await openDb();
  const r = (await req(db.transaction('settings').objectStore('settings').get(key))) as { value: T } | undefined;
  return r ? r.value : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await put('settings', { key, value });
}

export async function exportAll(): Promise<DataSet> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAMES);
  const out = emptyDataSet();
  await Promise.all(STORE_NAMES.map(async (s) => ((out[s] as unknown[]) = await req(tx.objectStore(s).getAll()))));
  return out;
}

/**
 * Applies an import in one transaction across every store. If any write fails the
 * whole transaction aborts and the existing data is left as it was.
 */
export async function applyImport(writes: DataSet, replace: boolean): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  const finished = done(tx);
  try {
    for (const s of STORE_NAMES) {
      const store = tx.objectStore(s);
      if (replace) store.clear();
      for (const v of writes[s] as unknown[]) store.put(s === 'foodEntries' ? normalizeFoodEntry(v as FoodEntry) : v);
    }
  } catch (e) {
    tx.abort();
    throw e;
  }
  await finished;
}

/** Deletes one profile and everything that belongs to it, atomically. */
export async function deleteProfile(profileId: string): Promise<void> {
  const db = await openDb();
  const stores: StoreName[] = ['profiles', 'foodEntries', 'customFoods', 'savedMeals', 'exerciseEntries', 'weightEntries', 'goalHistory', 'dayStatus'];
  const tx = db.transaction(stores, 'readwrite');
  const finished = done(tx);
  tx.objectStore('profiles').delete(profileId);
  for (const s of stores.slice(1)) {
    const idx = tx.objectStore(s).index('profileId');
    const keys = await req(idx.getAllKeys(profileId));
    for (const k of keys) tx.objectStore(s).delete(k);
  }
  await finished;
}

export async function wipeAll(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  for (const s of STORE_NAMES) tx.objectStore(s).clear();
  await done(tx);
}

/** Ask the browser not to evict our storage under pressure. Best effort. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignored */
  }
  return null;
}
