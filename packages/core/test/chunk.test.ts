import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpec, type Spec } from "@potluck/spec";
import { describe, expect, it } from "vitest";
import { AccountBloom } from "../src/bloom.js";
import {
  buildChunk,
  ChunkAccumulator,
  chunkAccounts,
  gunzip,
  gzip,
  planChunks,
} from "../src/chunk.js";
import { encodeRow, rawHash } from "../src/encoding.js";
import { compileSpec, eventsToRows, type IndexedRow } from "../src/engine.js";
import { decodeEvents } from "../src/events.js";
import { polkadotAh, runtime } from "./fixtures.js";

const baseSpec = parseSpec(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "..", "..", "specs", "polkadot-ah.balance-history.json"),
      "utf8",
    ),
  ),
);
const RECENT = polkadotAh.blocks.at(-1) as (typeof polkadotAh.blocks)[number];
const realRows = eventsToRows(
  compileSpec(baseSpec),
  decodeEvents(runtime(RECENT.postStateSpec), RECENT.number, `0x${RECENT.eventsHex}`),
);

/** Real rows re-stamped onto chosen block numbers, to exercise the planner's boundaries. */
function rowsAt(blocks: number[]): IndexedRow[] {
  return blocks.flatMap((block) => realRows.map((r) => ({ ...r, block })));
}
const lineBytes = (spec: Spec, rows: IndexedRow[]) =>
  rows.reduce((n, r) => n + encodeRow(spec, r).length + 1, 0);
const withChunk = (chunk: Spec["chunk"]): Spec => ({ ...baseSpec, chunk });

function expectContiguous(
  plans: { fromBlock: number; toBlock: number }[],
  from: number,
  to: number,
) {
  expect(plans[0]?.fromBlock).toBe(from);
  expect(plans.at(-1)?.toBlock).toBe(to);
  for (let i = 1; i < plans.length; i++) {
    expect(plans[i]?.fromBlock).toBe((plans[i - 1]?.toBlock as number) + 1);
  }
}

describe("planChunks", () => {
  it("covers the whole range contiguously and never splits a block", () => {
    const rows = rowsAt([100, 101, 150, 151, 199]);
    const spec = withChunk({ maxBlocks: 50, maxRawBytes: 32_000_000 });
    const plans = planChunks(spec, rows, { fromBlock: 90, toBlock: 260 });
    expectContiguous(plans, 90, 260);
    expect(plans.flatMap((p) => p.rows)).toEqual(rows);
    for (const plan of plans) {
      for (const row of plan.rows) {
        expect(row.block).toBeGreaterThanOrEqual(plan.fromBlock);
        expect(row.block).toBeLessThanOrEqual(plan.toBlock);
      }
    }
    expect(plans.map((p) => [p.fromBlock, p.toBlock])).toEqual([
      [90, 149],
      [150, 260],
    ]);
  });

  it("closes chunks before exceeding maxRawBytes", () => {
    const perBlock = lineBytes(baseSpec, rowsAt([1]));
    const spec = withChunk({ maxBlocks: 1_000_000, maxRawBytes: perBlock * 2 });
    const plans = planChunks(spec, rowsAt([1, 2, 3, 4, 5]), { fromBlock: 1, toBlock: 5 });
    expect(plans.map((p) => [p.fromBlock, p.toBlock, p.rows.length / realRows.length])).toEqual([
      [1, 2, 2],
      [3, 4, 2],
      [5, 5, 1],
    ]);
    for (const plan of plans) expect(lineBytes(spec, plan.rows)).toBeLessThanOrEqual(perBlock * 2);
  });

  it("puts a single oversized block into its own chunk", () => {
    const perBlock = lineBytes(baseSpec, rowsAt([1]));
    const spec = withChunk({ maxBlocks: 1_000_000, maxRawBytes: Math.floor(perBlock / 2) });
    const plans = planChunks(spec, rowsAt([7, 8]), { fromBlock: 7, toBlock: 8 });
    expect(plans.map((p) => [p.fromBlock, p.toBlock])).toEqual([
      [7, 7],
      [8, 8],
    ]);
  });

  it("emits one empty chunk for a range without rows", () => {
    expect(planChunks(baseSpec, [], { fromBlock: 10, toBlock: 20 })).toEqual([
      { fromBlock: 10, toBlock: 20, rows: [] },
    ]);
  });

  it("rejects rows outside the range and empty ranges", () => {
    expect(() => planChunks(baseSpec, rowsAt([5]), { fromBlock: 10, toBlock: 20 })).toThrow(
      "outside",
    );
    expect(() => planChunks(baseSpec, [], { fromBlock: 2, toBlock: 1 })).toThrow("empty range");
  });
});

describe("buildChunk", () => {
  it("produces a verifiable, compressed chunk with an account bloom", async () => {
    const plan = { fromBlock: RECENT.number, toBlock: RECENT.number, rows: realRows };
    const chunk = await buildChunk(baseSpec, plan);
    expect(chunk.rows).toBe(realRows.length);
    expect(chunk.rawHash).toBe(rawHash(chunk.raw));
    expect(await gunzip(chunk.blob)).toEqual(chunk.raw);
    const accounts = chunkAccounts(baseSpec, realRows);
    expect(chunk.accounts).toBe(accounts.size);
    const bloom = AccountBloom.fromBase64(chunk.bloom);
    for (const account of accounts) expect(bloom.has(account)).toBe(true);
  });
});

describe("gzip", () => {
  it("round-trips arbitrary bytes", async () => {
    const bytes = randomBytes(100_000);
    expect(await gunzip(await gzip(bytes))).toEqual(new Uint8Array(bytes));
  });
});

describe("AccountBloom", () => {
  const randomAccount = () => `0x${randomBytes(32).toString("hex")}`;

  it("has no false negatives and ~1% false positives", () => {
    const inserted = Array.from({ length: 5000 }, randomAccount);
    const bloom = AccountBloom.of(inserted);
    for (const a of inserted) expect(bloom.has(a)).toBe(true);
    const probes = 20_000;
    let falsePositives = 0;
    for (let i = 0; i < probes; i++) if (bloom.has(randomAccount())) falsePositives++;
    expect(falsePositives / probes).toBeLessThan(0.02);
  });

  it("sizes with the number of accounts and round-trips through base64", () => {
    expect(AccountBloom.forCount(10).bits.length).toBe(64);
    expect(AccountBloom.forCount(10_000).bits.length).toBe(12_000);
    const bloom = AccountBloom.of([randomAccount(), randomAccount()]);
    expect(AccountBloom.fromBase64(bloom.toBase64()).bits).toEqual(bloom.bits);
  });

  it("accepts H160 addresses and is case-insensitive", () => {
    const h160 = `0x${randomBytes(20).toString("hex")}`;
    const bloom = AccountBloom.of([h160]);
    expect(bloom.has(h160.toUpperCase().replace("0X", "0x"))).toBe(true);
  });
});

describe("ChunkAccumulator", () => {
  const spec = withChunk({ maxBlocks: 3, maxRawBytes: 32_000_000 });
  const blocks = [10, 11, 13, 14, 15, 19, 20];
  const rowsOfBlock = (b: number) => rowsAt([b]);

  it("streams the same chunks as planChunks", () => {
    const acc = new ChunkAccumulator(spec, 8);
    const streamed = [];
    for (let b = 8; b <= 22; b++)
      streamed.push(...acc.push(b, blocks.includes(b) ? rowsOfBlock(b) : []));
    streamed.push(acc.finish(22));
    expect(streamed).toEqual(planChunks(spec, rowsAt(blocks), { fromBlock: 8, toBlock: 22 }));
  });

  it("resumed at a closed chunk boundary yields the remaining chunks unchanged", () => {
    const full = planChunks(spec, rowsAt(blocks), { fromBlock: 8, toBlock: 22 });
    const resumeAt = (full[0]?.toBlock as number) + 1;
    const acc = new ChunkAccumulator(spec, resumeAt);
    const rest = [];
    for (let b = resumeAt; b <= 22; b++)
      rest.push(...acc.push(b, blocks.includes(b) ? rowsOfBlock(b) : []));
    rest.push(acc.finish(22));
    expect(rest).toEqual(full.slice(1));
  });

  it("restored mid-chunk from its pending rows yields the same chunks as an uninterrupted run", () => {
    const full = planChunks(spec, rowsAt(blocks), { fromBlock: 8, toBlock: 22 });
    for (let crashAfter = 8; crashAfter < 22; crashAfter++) {
      const first = new ChunkAccumulator(spec, 8);
      const out = [];
      for (let b = 8; b <= crashAfter; b++)
        out.push(...first.push(b, blocks.includes(b) ? rowsOfBlock(b) : []));
      const resumed = ChunkAccumulator.restore(spec, first.start, first.pending, crashAfter);
      for (let b = crashAfter + 1; b <= 22; b++)
        out.push(...resumed.push(b, blocks.includes(b) ? rowsOfBlock(b) : []));
      out.push(resumed.finish(22));
      expect(out).toEqual(full);
    }
  });

  it("rejects out-of-order blocks and mislabeled rows", () => {
    const acc = new ChunkAccumulator(spec, 1);
    acc.push(5, []);
    expect(() => acc.push(5, [])).toThrow("out of order");
    expect(() => acc.push(6, rowsOfBlock(7))).toThrow("pushed as #6");
    expect(() => acc.finish(4)).toThrow("before last block");
  });
});
