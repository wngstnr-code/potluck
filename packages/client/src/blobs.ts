import { blake2AsHex } from "@polkadot/util-crypto";
import { hexToBytes, type RpcClient } from "@potluck/core";
import { blobCid } from "./cid.js";

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
