/**
 * Live tests of the unified dual-VM history against the public Portaldot V3 testnet, from genesis
 * to the finalized head. Skipped unless POTLUCK_LIVE=1.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpec } from "@potluck/spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileSpec, eventsToRows, type IndexedRow } from "../src/engine.js";
import { decodeEvents, type RawBlockEvents, scanRawEvents } from "../src/events.js";
import { reconcileAccounts } from "../src/reconcile.js";
import {
  connectWs,
  getBlockHashes,
  getFinalizedHead,
  type RpcClient,
  withRetry,
} from "../src/rpc.js";
import { buildRuntimeMap, RuntimeLoader, type RuntimeMap } from "../src/runtime.js";

const LIVE = process.env.POTLUCK_LIVE === "1";
const WS = "wss://test-node-v3.portaldot.dev";
const EVM_RPC = "https://test-evm-rpc-v3.portaldot.dev";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
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

async function ethTransferLogs(toBlock: number) {
  const response = await fetch(EVM_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [
        { fromBlock: "0x1", toBlock: `0x${toBlock.toString(16)}`, topics: [TRANSFER_TOPIC] },
      ],
    }),
  });
  return (
    (await response.json()) as { result: { address: string; topics: string[]; data: string }[] }
  ).result;
}

describe.skipIf(!LIVE)("live unified history on Portaldot V3 testnet (genesis → head)", () => {
  let client: RpcClient;
  let head: number;
  let scanned: RawBlockEvents[];
  let map: RuntimeMap;
  let loader: RuntimeLoader;
  let rows: IndexedRow[];
  const knownHashes = new Map<number, string>();
  const hashOf = async (block: number) =>
    knownHashes.get(block) ?? ((await getBlockHashes(client, [block]))[0] as string);

  beforeAll(async () => {
    client = withRetry(await connectWs(WS));
    head = (await getFinalizedHead(client)).number;
  });
  afterAll(async () => {
    await client?.close();
  });

  it("scans every block from genesis with the fast path, identical to per-block reads", async () => {
    const started = performance.now();
    const result = await scanRawEvents(client, 1, head);
    const seconds = (performance.now() - started) / 1000;
    expect(result.strategy).toBe("query-storage");
    expect(result.blocks.length).toBe(head);
    scanned = result.blocks;
    for (const b of scanned) knownHashes.set(b.block, b.hash);
    knownHashes.set(0, await hashOf(0));
    console.log(`scanned ${head} blocks in ${seconds.toFixed(1)} s`);

    const window = await scanRawEvents(client, head - 299, head, {
      strategy: "per-block",
      concurrency: 32,
    });
    expect(scanned.slice(-300)).toEqual(window.blocks);
  }, 300_000);

  it("decodes the whole chain and token rows equal eth_getLogs as a multiset", async () => {
    map = await buildRuntimeMap(client, 1, head, { hashOf, samples: 32 });
    loader = new RuntimeLoader(client);
    const compiled = compileSpec(spec);
    const events = [];
    for (const { block, raw } of scanned) {
      if (raw.length === 0) continue;
      const runtime = await loader.load(map.executingVersion(block), await hashOf(block - 1));
      events.push(...decodeEvents(runtime, block, raw));
    }
    rows = eventsToRows(compiled, events);
    const tokenRows = rows
      .filter((r) => r.cells.asset !== "native")
      .map((r) =>
        [
          r.cells.kind,
          r.cells.asset,
          r.cells.from,
          r.cells.to,
          r.cells.amount,
          r.cells.tokenId,
        ].join("|"),
      )
      .sort();
    const logs = (await ethTransferLogs(head))
      .filter((l) => l.topics.length === 3 || l.topics.length === 4)
      .map((l) => {
        const erc20 = l.topics.length === 3;
        return [
          erc20 ? "Erc20Transfer" : "Erc721Transfer",
          l.address.toLowerCase(),
          `0x${(l.topics[1] as string).slice(26)}`,
          `0x${(l.topics[2] as string).slice(26)}`,
          erc20 ? BigInt(l.data).toString() : "",
          erc20 ? "" : BigInt(l.topics[3] as string).toString(),
        ].join("|");
      })
      .sort();
    expect(logs.length).toBeGreaterThan(0);
    expect(tokenRows).toEqual(logs);
    console.log(
      `${rows.length} rows (${tokenRows.length} token rows), runtime upgrades: ${map.upgradeBlocks.join(", ") || "none"}`,
    );
  }, 300_000);

  it("reconciles every native account from genesis to head", async () => {
    const results = await reconcileAccounts({
      client,
      spec,
      rows,
      fromBlock: 1,
      toBlock: head,
      hashOf,
      runtimeFor: async (block) =>
        loader.load(map.executingVersion(block), await hashOf(block === 0 ? 0 : block - 1)),
      concurrency: 32,
    });
    const failures = results.filter((r) => !r.ok);
    console.log(`reconciled ${results.length - failures.length}/${results.length} native accounts`);
    expect(results.length).toBeGreaterThan(50);
    expect(
      failures.map((f) => `${f.account}: expected ${f.expectedDelta}, actual ${f.actualDelta}`),
    ).toEqual([]);
  }, 300_000);
});
