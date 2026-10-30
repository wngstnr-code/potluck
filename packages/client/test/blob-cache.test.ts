import { readFileSync } from "node:fs";
import { u8aToHex } from "@polkadot/util";
import type { RpcClient } from "@potluck/core";
import { canonicalSpecBytes, parseSpec, specHash } from "@potluck/spec";
import { describe, expect, it } from "vitest";
import { type BlobCache, fetchCachedBlob } from "../src/blobs.js";

// The canonical Kusama AH recovery-timeline spec: the blob stored on Portaldot whose digest is
// its spec hash (PORTALDOT_TESTNET.specs["kusama-ah.recovery-timeline"]).
const spec = parseSpec(
  JSON.parse(
    readFileSync(
      new URL("../../../specs/kusama-ah.recovery-timeline.json", import.meta.url),
      "utf8",
    ),
  ),
);
const bytes = canonicalSpecBytes(spec);
const digest = specHash(spec);

/** Answers bitswap_v1_get with the blob and counts the calls. */
function node() {
  const client = {
    calls: 0,
    async send<T>(method: string): Promise<T> {
      if (method !== "bitswap_v1_get") throw new Error(`unexpected ${method}`);
      client.calls++;
      return u8aToHex(bytes) as T;
    },
    async close() {},
  };
  return client satisfies RpcClient;
}

const memory = (): BlobCache & { map: Map<string, Uint8Array> } => {
  const map = new Map<string, Uint8Array>();
  return { map, get: async (d) => map.get(d), put: async (d, b) => void map.set(d, b) };
};

describe("fetchCachedBlob", () => {
  it("fetches once, then serves the cached copy", async () => {
    const client = node();
    const cache = memory();
    const first = await fetchCachedBlob(client, digest, cache);
    const second = await fetchCachedBlob(client, digest, cache);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.bytes).toEqual(bytes);
    expect(client.calls).toBe(1);
  });

  it("ignores a cached copy that no longer hashes to the digest", async () => {
    const client = node();
    const cache = memory();
    cache.map.set(digest, new Uint8Array([1, 2, 3]));
    const result = await fetchCachedBlob(client, digest, cache);
    expect(result.cached).toBe(false);
    expect(result.bytes).toEqual(bytes);
    expect(cache.map.get(digest)).toEqual(bytes);
  });

  it("still loads when the cache fails", async () => {
    const broken: BlobCache = {
      get: () => Promise.reject(new Error("quota")),
      put: () => Promise.reject(new Error("quota")),
    };
    const result = await fetchCachedBlob(node(), digest, broken);
    expect(result.bytes).toEqual(bytes);
  });
});
