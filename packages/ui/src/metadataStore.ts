import type { MetadataStore } from "@potluck/core";

const DB = "potluck";
const STORE = "metadata";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Runtime metadata cached in IndexedDB per chain and spec version, so a second visit does not
 * make the node execute old runtimes again (~10 s each on the public Portaldot node). Any storage
 * failure (private mode, quota) degrades to fetching from the node.
 */
export class IndexedDbMetadataStore implements MetadataStore {
  readonly #db: Promise<IDBDatabase | null>;

  constructor(private readonly genesisHash: string) {
    this.#db = open().catch(() => null);
  }

  #key(specVersion: number) {
    return `${this.genesisHash}:${specVersion}`;
  }

  async get(specVersion: number): Promise<Uint8Array | undefined> {
    const db = await this.#db;
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE).objectStore(STORE).get(this.#key(specVersion));
        req.onsuccess = () => resolve(req.result instanceof Uint8Array ? req.result : undefined);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  async put(specVersion: number, metadata: Uint8Array): Promise<void> {
    const db = await this.#db;
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(metadata, this.#key(specVersion));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
