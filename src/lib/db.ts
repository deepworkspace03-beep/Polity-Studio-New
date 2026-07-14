import type { Doc } from "./types";

/**
 * Minimal typed IndexedDB layer — one database, two stores:
 *   docs — full documents, keyed by id
 *   kv   — settings, brand config and other single objects
 * IndexedDB (vs localStorage) removes the ~5 MB ceiling and keeps
 * large documents off the main thread during serialization.
 */

const DB_NAME = "polity-studio";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => {
      const db = req.result;
      // Browsers may close the connection out from under the page
      // (storage pressure on tablets, or another tab upgrading the
      // schema). A cached handle to a closed connection would make every
      // later autosave reject silently — drop it so the next operation
      // reopens instead.
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: "docs" | "kv", mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  try {
    return db.transaction(name, mode).objectStore(name);
  } catch {
    // The connection closed without onclose having fired yet — reopen
    // once so a single dropped connection never loses a save.
    dbPromise = null;
    return (await openDb()).transaction(name, mode).objectStore(name);
  }
}

export const db = {
  async allDocs(): Promise<Doc[]> {
    return request((await store("docs", "readonly")).getAll() as IDBRequest<Doc[]>);
  },
  async putDoc(doc: Doc): Promise<void> {
    await request((await store("docs", "readwrite")).put(doc));
  },
  async deleteDoc(id: string): Promise<void> {
    await request((await store("docs", "readwrite")).delete(id));
  },
  async getKv<T>(key: string): Promise<T | undefined> {
    return request((await store("kv", "readonly")).get(key) as IDBRequest<T | undefined>);
  },
  async putKv(key: string, value: unknown): Promise<void> {
    await request((await store("kv", "readwrite")).put(value, key));
  },
};
