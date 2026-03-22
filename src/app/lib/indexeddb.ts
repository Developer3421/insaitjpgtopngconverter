const DB_NAME = "jpeg-to-png-converter";
const DB_VERSION = 1;
const STORE_NAME = "conversions";

export interface ConversionRecord {
  id: string;
  originalName: string;
  outputName: string;
  originalSize: number;
  outputSize: number;
  convertedAt: number;
  blob: Blob;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("convertedAt", "convertedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  return openDB().then(
    (db) =>
      new Promise<T | void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const result = action(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => {
          db.close();
          resolve(result ? (result.result as T) : undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

export async function saveConversion(record: ConversionRecord): Promise<void> {
  await runTransaction("readwrite", (store) => store.put(record));
}

export async function listConversions(): Promise<ConversionRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).index("convertedAt").getAll();
    tx.oncomplete = () => {
      db.close();
      resolve((request.result as ConversionRecord[]).slice().reverse());
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function deleteConversion(id: string): Promise<void> {
  await runTransaction("readwrite", (store) => store.delete(id));
}

export async function clearAllConversions(): Promise<void> {
  await runTransaction("readwrite", (store) => store.clear());
}
