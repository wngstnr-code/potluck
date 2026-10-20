/**
 * Live end-to-end tests against public Polkadot Asset Hub archive RPC.
 * Skipped unless POTLUCK_LIVE=1 (run: pnpm --filter @potluck/core test:live).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpec } from "@potluck/spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildChunk, gunzip, planChunks } from "../src/chunk.js";
import { decodeNdjson, encodeNdjson } from "../src/encoding.js";
import { compileSpec, eventsToRows } from "../src/engine.js";
import { decodeEvents, fetchRawEvents } from "../src/events.js";
import { reconcileAccounts } from "../src/reconcile.js";
import {
  connectWs,
  getBlockHashes,
  getFinalizedHead,
  mapPool,
  type RpcClient,
  withRetry,
} from "../src/rpc.js";
import { buildRuntimeMap, RuntimeLoader } from "../src/runtime.js";

const LIVE = process.env.POTLUCK_LIVE === "1";
const URL = "wss://polkadot-asset-hub-rpc.polkadot.io";
const spec = parseSpec(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "..", "..", "specs", "polkadot-ah.balance-history.json"),
      "utf8",
    ),
  ),
);

/**
 * Runtime upgrades seen by a map that starts two blocks before the Revive window: the upgrade that
 * enabled Revive itself (#11,405,258; its storage appears at #11,405,259), then the nine upgrades
 * measured inside the window in spike S1.
 */
const S1_UPGRADES = [
  11_405_258, 11_896_182, 12_319_017, 13_733_620, 14_857_499, 16_946_479, 17_297_796, 18_731_801,
  20_135_078, 20_485_672,
];

describe.skipIf(!LIVE)("live pipeline on Polkadot Asset Hub", () => {
  let client: RpcClient;
  beforeAll(async () => {
    client = withRetry(await connectWs(URL));
  });
  afterAll(async () => {
    await client?.close();
  });
  const hashOf = async (block: number) => (await getBlockHashes(client, [block]))[0] as string;

  it("finds exactly the S1 runtime upgrades in the Revive window", async () => {
    const map = await buildRuntimeMap(client, spec.source.fromBlock, 20_485_700, {
      hashOf,
      samples: 160,
    });
    expect(map.upgradeBlocks).toEqual(S1_UPGRADES);
  }, 300_000);

  it("indexes a recent window and reconciles every touched account exactly", async () => {
    const head = await getFinalizedHead(client);
    const toBlock = head.number;
    const fromBlock = toBlock - 299;
    const blocks = Array.from({ length: toBlock - fromBlock + 2 }, (_, i) => fromBlock - 1 + i);
    const hashes = await getBlockHashes(client, blocks);
    const hashAt = (block: number) => hashes[block - (fromBlock - 1)] as string;

    const map = await buildRuntimeMap(client, fromBlock, toBlock, {
      hashOf: async (b) => (b >= fromBlock - 1 && b <= toBlock ? hashAt(b) : hashOf(b)),
    });
    const loader = new RuntimeLoader(client);
    const runtimeFor = (block: number) =>
      loader.load(map.executingVersion(block), hashAt(block - 1));

    const compiled = compileSpec(spec);
    const perBlock = await mapPool(blocks.slice(1), 32, async (block) =>
      decodeEvents(await runtimeFor(block), block, await fetchRawEvents(client, hashAt(block))),
    );
    const rows = eventsToRows(compiled, perBlock.flat());
    expect(rows.length).toBeGreaterThan(0);

    // Deterministic, verifiable chunks.
    const plans = planChunks(spec, rows, { fromBlock, toBlock });
    for (const plan of plans) {
      const chunk = await buildChunk(spec, plan);
      expect(encodeNdjson(spec, decodeNdjson(spec, await gunzip(chunk.blob)))).toEqual(chunk.raw);
    }

    // L3: every account touched in the window reconciles exactly.
    const results = await reconcileAccounts({
      client,
      spec,
      rows,
      fromBlock,
      toBlock,
      hashOf: async (b) => hashAt(b),
      runtimeFor,
      concurrency: 32,
    });
    const failures = results.filter((r) => !r.ok);
    expect(results.length).toBeGreaterThan(10);
    expect(failures.map((f) => `${f.account}: ${f.expectedDelta} != ${f.actualDelta}`)).toEqual([]);

    // Tampering is detected: drop one debit row of an account that is not reset (reaped) in the
    // window — a reset legitimately absorbs same-block rows — and it no longer reconciles.
    const resetAccounts = new Set(rows.filter((r) => r.effect === "reset").map((r) => r.cells.to));
    const victim = rows.find(
      (r) =>
        r.effect === "delta" &&
        r.cells.from !== null &&
        r.cells.to === null &&
        !resetAccounts.has(r.cells.from),
    );
    expect(victim).toBeDefined();
    if (victim) {
      const tampered = await reconcileAccounts({
        client,
        spec,
        rows: rows.filter((r) => r !== victim),
        fromBlock,
        toBlock,
        hashOf: async (b) => hashAt(b),
        runtimeFor,
        accounts: [victim.cells.from as string],
      });
      expect(tampered[0]?.ok).toBe(false);
    }
  }, 300_000);
});
