import { blake2AsHex } from "@polkadot/util-crypto";
import { hexToBytes, type RpcClient } from "@potluck/core";
import { blobCid } from "./cid.js";

/**
 * Local store of blobs by digest (e.g. IndexedDB in a browser), so a history loaded once does not
 * travel over bitswap again. Entries are untrusted: every read is hash-checked again.
 */
export interface BlobCache {
  get(digest: string): Promise<Uint8Array | undefined>;
  put(digest: string, bytes: Uint8Array): Promise<void>;
}

/**
 * Fetches a TransactionStorage blob by its blake2b-256 digest through `bitswap_v1_get` on a
 * Portaldot node, and checks the bytes hash to the requested digest (the node is not trusted).
 */
export async function fetchBlob(client: RpcClient, digest: string): Promise<Uint8Array> {
  let hex: string | null;
  try {
    hex = await client.send<string | null>("bitswap_v1_get", [blobCid(digest)]);
  } catch (error) {
    if (/NotFound|not found/i.test(String((error as Error)?.message ?? error))) hex = null;
    else throw error;
  }
  if (!hex) throw new Error(`blob ${digest} is not available (expired or never stored)`);
  const bytes = hexToBytes(hex);
  if (blake2AsHex(bytes, 256) !== digest.toLowerCase()) {
    throw new Error(`blob ${digest}: node returned bytes with a different digest`);
  }
  return bytes;
}

/**
 * `fetchBlob` through a cache: a cached copy is used only when it still hashes to the digest,
 * otherwise the blob is fetched again and the cache refreshed. Returns where the bytes came from.
 */
export async function fetchCachedBlob(
  client: RpcClient,
  digest: string,
  cache: BlobCache | undefined,
): Promise<{ bytes: Uint8Array; cached: boolean }> {
  const hit = await cache?.get(digest.toLowerCase()).catch(() => undefined);
  if (hit && blake2AsHex(hit, 256) === digest.toLowerCase()) return { bytes: hit, cached: true };
  const bytes = await fetchBlob(client, digest);
  await cache?.put(digest.toLowerCase(), bytes).catch(() => undefined);
  return { bytes, cached: false };
}
