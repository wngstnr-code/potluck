const DB = "potluck-blobs";
const STORE = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Specs, manifests and chunks fetched from Portaldot, kept in IndexedDB by digest so a reload
 * loads a published history without bitswap. The client hash-checks every entry it reads back.
 * Any storage failure (private mode, quota) degrades to fetching from the node. Matches the
 * client's `BlobCache` interface structurally, so this package needs no client dependency.
 */
export class IndexedDbBlobCache {
  readonly #db: Promise<IDBDatabase | null> = open().catch(() => null);

  async get(digest: string): Promise<Uint8Array | undefined> {
    const db = await this.#db;
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE).objectStore(STORE).get(digest);
        req.onsuccess = () => resolve(req.result instanceof Uint8Array ? req.result : undefined);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  async put(digest: string, bytes: Uint8Array): Promise<void> {
    const db = await this.#db;
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(bytes, digest);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
