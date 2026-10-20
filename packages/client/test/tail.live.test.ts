import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  connectWs,
  getFinalizedHead,
  type IndexedRow,
  type RpcClient,
  withRetry,
} from "@potluck/core";
import { parseSpec } from "@potluck/spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { followHistory } from "../src/tail.js";

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

describe.skipIf(!LIVE)("followHistory on Portaldot V3 testnet", () => {
  let client: RpcClient;
  beforeAll(async () => {
    client = withRetry(await connectWs("wss://test-node-v3.portaldot.dev"));
  });
  afterAll(async () => {
    await client?.close();
  });

  it("advances over new finalized blocks and reports their rows", async () => {
    const start = (await getFinalizedHead(client)).number;
    const seen: { rows: IndexedRow[]; upTo: number }[] = [];
    const errors: unknown[] = [];
    const stop = followHistory({
      spec,
      source: client,
      accounts: [],
      afterBlock: start - 20, // replay 20 recent blocks, then follow
      intervalMs: 3_000,
      onRows: (rows, upTo) => seen.push({ rows, upTo }),
      onError: (e) => errors.push(e),
    });
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && !(seen.length >= 2 && (seen.at(-1)?.upTo ?? 0) > start)) {
      await new Promise((r) => setTimeout(r, 1_000));
    }
    stop();
    expect(errors).toEqual([]);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.at(-1)?.upTo).toBeGreaterThan(start);
    for (const { rows, upTo } of seen)
      for (const row of rows) expect(row.block).toBeLessThanOrEqual(upTo);
  }, 90_000);
});
