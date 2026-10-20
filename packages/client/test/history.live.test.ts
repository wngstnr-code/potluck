/**
 * Live tests of accountHistory against the public Portaldot V3 testnet, with manifests served from
 * memory (built from real chain data by core) because nothing is published on chain yet.
 * Skipped unless POTLUCK_LIVE=1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { u8aToHex } from "@polkadot/util";
import { blake2AsHex, decodeAddress } from "@polkadot/util-crypto";
import {
  buildChunk,
  buildManifest,
  buildRuntimeMap,
  compileSpec,
  connectWs,
  decodeEvents,
  eventsToRows,
  getBlockHashes,
  type IndexedRow,
  type ManifestChunk,
  manifestChunk,
  planChunks,
  type RpcClient,
  RuntimeLoader,
  scanRawEvents,
  withRetry,
} from "@potluck/core";
import { parseSpec, type Spec } from "@potluck/spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountHistory, reviveAccountIdOf, reviveAddressOf } from "../src/history.js";
import type { ManifestEntry, ManifestSource } from "../src/source.js";

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
const smallChunks: Spec = { ...spec, chunk: { maxBlocks: 1000, maxRawBytes: 32_000_000 } };

/** In-memory ManifestSource: blobs by digest, one manifest entry. */
async function memorySource(rows: IndexedRow[], toBlockHash: string): Promise<ManifestSource> {
  const blobs = new Map<string, Uint8Array>();
  const chunks: ManifestChunk[] = [];
  for (const plan of planChunks(smallChunks, rows, RANGE)) {
    const built = await buildChunk(spec, plan);
    const entry = manifestChunk(built);
    blobs.set(entry.blob.digest, built.blob);
    chunks.push(entry);
  }
  const manifest = buildManifest({ spec, range: { ...RANGE, toBlockHash }, chunks, tool: "test" });
  const entry: ManifestEntry = {
    manifest,
    digest: blake2AsHex("memory"),
    publisher: null,
    flags: 0,
  };
  return {
    list: async () => [entry],
    blob: async (digest) => {
      const blob = blobs.get(digest);
      if (!blob) throw new Error("missing blob");
      return blob;
    },
  };
}

describe.skipIf(!LIVE)("accountHistory on Portaldot V3 testnet", () => {
  let client: RpcClient;
  let rows: IndexedRow[];
  let account: string;
  /** A native account whose rows sit in exactly one chunk, to exercise bloom skipping. */
  let rareAccount: string;
  let toBlockHash: string;

  beforeAll(async () => {
    client = withRetry(await connectWs("wss://test-node-v3.portaldot.dev"));
    const known = new Map<number, string>();
    const hashOf = async (b: number) =>
      known.get(b) ?? ((await getBlockHashes(client, [b]))[0] as string);
    const scan = await scanRawEvents(client, RANGE.fromBlock, RANGE.toBlock);
    for (const b of scan.blocks) known.set(b.block, b.hash);
    toBlockHash = await hashOf(RANGE.toBlock);
    const map = await buildRuntimeMap(client, RANGE.fromBlock, RANGE.toBlock, { hashOf });
    const loader = new RuntimeLoader(client);
    const compiled = compileSpec(spec);
    rows = [];
    for (const { block, raw } of scan.blocks) {
      if (raw.length === 0) continue;
      const runtime = await loader.load(map.executingVersion(block), await hashOf(block - 1));
      rows.push(...eventsToRows(compiled, decodeEvents(runtime, block, raw)));
    }
    // The native account with the most rows spread over several chunks.
    const counts = new Map<string, Set<number>>();
    for (const r of rows.filter((x) => x.cells.asset === "native")) {
      for (const a of [r.cells.from, r.cells.to]) {
        if (a)
          counts.set(
            a,
            (counts.get(a) ?? new Set()).add(Math.floor((r.block - RANGE.fromBlock) / 1000)),
          );
      }
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1].size - a[1].size);
    account = ranked[0]?.[0] as string;
    rareAccount = ranked.find(([, chunks]) => chunks.size === 1)?.[0] as string;
  }, 600_000);
  afterAll(async () => {
    await client?.close();
  });

  const rowsOf = (rs: IndexedRow[], who: string) =>
    rs.filter((r) => r.cells.from === who || r.cells.to === who);
  const mineOf = (rs: IndexedRow[]) => rowsOf(rs, account);

  it("direct mode: the account's history equals the chain and reconciles", async () => {
    const result = await accountHistory({ spec, source: client, accounts: [account], ...RANGE });
    expect(result.segments.map((s) => s.mode)).toEqual(["direct"]);
    expect(result.rows).toEqual(mineOf(rows));
    expect(result.verified).toBe(true);
  }, 600_000);

  it("snapshot + direct tail: same rows as the chain, everything verifies", async () => {
    const result = await accountHistory({
      spec,
      source: client,
      manifests: await memorySource(rows, toBlockHash),
      accounts: [account],
      fromBlock: RANGE.fromBlock,
      toBlock: RANGE.toBlock + 200,
    });
    expect(result.segments.map((s) => s.mode)).toEqual(["snapshot", "direct"]);
    expect(result.rows.filter((r) => r.block <= RANGE.toBlock)).toEqual(mineOf(rows));
    expect(result.verified).toBe(true);
  }, 600_000);

  it("downloads only chunks whose bloom may contain the account, and still verifies", async () => {
    expect(rareAccount).toBeDefined();
    const result = await accountHistory({
      spec,
      source: client,
      manifests: await memorySource(rows, toBlockHash),
      accounts: [rareAccount],
      ...RANGE,
    });
    const snapshot = result.segments[0];
    expect(snapshot?.chunksDownloaded).toBeGreaterThanOrEqual(1);
    expect(snapshot?.chunksSkippedByBloom).toBeGreaterThan(0);
    expect(result.rows).toEqual(rowsOf(rows, rareAccount));
    expect(result.verified).toBe(true);
  }, 600_000);

  it("detects a publisher that hid all of the account's rows in one chunk (bloom lies too)", async () => {
    const target = mineOf(rows).find((r) => r.cells.from === account) as IndexedRow;
    const chunkStart = RANGE.fromBlock + Math.floor((target.block - RANGE.fromBlock) / 1000) * 1000;
    const forgedRows = rows.filter(
      (r) => !(mineOf([r]).length > 0 && r.block >= chunkStart && r.block < chunkStart + 1000),
    );
    const result = await accountHistory({
      spec,
      source: client,
      manifests: await memorySource(forgedRows, toBlockHash),
      accounts: [account],
      ...RANGE,
    });
    expect(result.verified).toBe(false);
    expect(result.segments[0]?.reconciliation.some((r) => !r.ok)).toBe(true);
  }, 600_000);

  it("maps an AccountId32 to its Revive H160 via the runtime API", async () => {
    const validator = u8aToHex(decodeAddress("5F4ZyJJ8R3QHZKRLAfDXdUuVE4w3Q7uq7tCNfAtvf2XEBfYY"));
    expect(await reviveAddressOf(client, validator)).toBe(
      "0x9234511ee6f98f944b846d19d4013a81f93bd5f9",
    );
  });

  it("maps the H160 back to the same AccountId32", async () => {
    const validator = u8aToHex(decodeAddress("5F4ZyJJ8R3QHZKRLAfDXdUuVE4w3Q7uq7tCNfAtvf2XEBfYY"));
    const h160 = await reviveAddressOf(client, validator);
    expect(await reviveAccountIdOf(client, h160)).toBe(validator);
  });
});
