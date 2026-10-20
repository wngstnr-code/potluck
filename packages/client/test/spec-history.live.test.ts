/**
 * Live tests of specHistory / reconcileHistory against Portaldot V3 testnet. Manifests are served
 * from memory (built by core from the same chain data) because nothing is published on chain yet.
 * Skipped unless POTLUCK_LIVE=1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blake2AsHex } from "@polkadot/util-crypto";
import {
  buildChunk,
  buildManifest,
  connectWs,
  type IndexedRow,
  type ManifestChunk,
  manifestChunk,
  planChunks,
  type RpcClient,
  withRetry,
} from "@potluck/core";
import { parseSpec } from "@potluck/spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ManifestSource } from "../src/source.js";
import { reconcileHistory, specHistory } from "../src/spec-history.js";

const LIVE = process.env.POTLUCK_LIVE === "1";
const spec = parseSpec(
  JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "specs",
        "portaldot-v3-testnet.unified-history.json",
      ),
      "utf8",
    ),
  ),
);
const RANGE = { fromBlock: 97_000, toBlock: 103_100 };

async function memorySource(
  rows: IndexedRow[],
  range: { fromBlock: number; toBlock: number },
): Promise<ManifestSource> {
  const blobs = new Map<string, Uint8Array>();
  const chunks: ManifestChunk[] = [];
  const small = { ...spec, chunk: { maxBlocks: 1000, maxRawBytes: 32_000_000 } };
  for (const plan of planChunks(small, rows, range)) {
    const built = await buildChunk(spec, plan);
    const entry = manifestChunk(built);
    blobs.set(entry.blob.digest, built.blob);
    chunks.push(entry);
  }
  const manifest = buildManifest({
    spec,
    range: { ...range, toBlockHash: "0x00" },
    chunks,
    tool: "test",
  });
  return {
    list: async () => [{ manifest, digest: blake2AsHex("memory"), publisher: null, flags: 0 }],
    blob: async (digest) => blobs.get(digest) as Uint8Array,
  };
}

describe.skipIf(!LIVE)("specHistory on Portaldot V3 testnet", () => {
  let client: RpcClient;
  let direct: Awaited<ReturnType<typeof specHistory>>;
  beforeAll(async () => {
    client = withRetry(await connectWs("wss://test-node-v3.portaldot.dev"));
  });
  afterAll(async () => {
    await client?.close();
  });

  it("direct: streams rows in block order and reconciles every touched account", async () => {
    const streamed: IndexedRow[] = [];
    let lastUpTo = 0;
    direct = await specHistory({
      spec,
      source: client,
      ...RANGE,
      stepBlocks: 2_000,
      onRows: (rows, upTo) => {
        expect(upTo).toBeGreaterThan(lastUpTo);
        lastUpTo = upTo;
        streamed.push(...rows);
      },
    });
    expect(direct.segments.map((s) => s.mode)).toEqual(["direct"]);
    expect(streamed).toEqual(direct.rows);
    expect(direct.rows.length).toBeGreaterThan(0);
    const l3 = await reconcileHistory(direct, client);
    expect(l3.ok).toBe(true);
    expect(l3.checks).toBeGreaterThan(0);
  }, 600_000);

  it("snapshot + direct tail: same rows as direct sync, chunks pass L1", async () => {
    const snapRange = { fromBlock: RANGE.fromBlock, toBlock: RANGE.toBlock - 1_000 };
    const manifests = await memorySource(
      direct.rows.filter((r) => r.block <= snapRange.toBlock),
      snapRange,
    );
    const loaded = await specHistory({ spec, source: client, manifests, ...RANGE });
    expect(loaded.segments.map((s) => s.mode)).toEqual(["snapshot", "direct"]);
    expect(loaded.integrityOk).toBe(true);
    expect(loaded.rows).toEqual(direct.rows);
    expect((await reconcileHistory(loaded, client)).ok).toBe(true);
  }, 600_000);
});
