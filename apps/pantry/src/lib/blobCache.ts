import { IndexedDbBlobCache } from "@potluck/ui/blobCache";

/** One IndexedDB blob cache for every page: a history loaded once reloads without bitswap. */
export const BLOB_CACHE = new IndexedDbBlobCache();
