import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpec } from "@potluck/spec";
import { describe, expect, it } from "vitest";
import { buildChunk } from "../src/chunk.js";
import { compileSpec, eventsToRows, type IndexedRow } from "../src/engine.js";
import { decodeEvents } from "../src/events.js";
import { manifestChunk } from "../src/manifest.js";
import type { RpcClient } from "../src/rpc.js";
import { checkChunkIntegrity, checkRowTruth } from "../src/verify.js";
import { polkadotAh, runtime } from "./fixtures.js";

const spec = parseSpec(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "..", "..", "specs", "polkadot-ah.balance-history.json"),
      "utf8",
    ),
  ),
);
const RECENT = polkadotAh.blocks.at(-1) as (typeof polkadotAh.blocks)[number];
const rows = eventsToRows(
  compileSpec(spec),
  decodeEvents(runtime(RECENT.postStateSpec), RECENT.number, `0x${RECENT.eventsHex}`),
);
const plan = { fromBlock: RECENT.number, toBlock: RECENT.number, rows };

describe("checkChunkIntegrity (L1)", () => {
  it("accepts an honest chunk and returns its rows", async () => {
    const built = await buildChunk(spec, plan);
    const { problems, rows: decoded } = await checkChunkIntegrity(
      spec,
      manifestChunk(built),
      built.blob,
    );
    expect(problems).toEqual([]);
    expect(decoded).toEqual(rows);
  });

  it("flags a blob that does not match its manifest entry", async () => {
    const built = await buildChunk(spec, plan);
    const other = await buildChunk(spec, { ...plan, rows: rows.slice(1) });
    const { problems } = await checkChunkIntegrity(spec, manifestChunk(built), other.blob);
    expect(problems).toContain("blob digest mismatch");
    expect(problems).toContain("raw hash mismatch");
    expect(
      (await checkChunkIntegrity(spec, manifestChunk(built), new Uint8Array([1, 2]))).problems,
    ).toContain("blob is not gzip");
  });

  it("cannot see a consistent forgery (hashes recomputed) — that is what L2/L3 are for", async () => {
    const forged = await buildChunk(spec, { ...plan, rows: rows.slice(1) });
    expect((await checkChunkIntegrity(spec, manifestChunk(forged), forged.blob)).problems).toEqual(
      [],
    );
  });
});

/** Serves the recorded block's real System.Events like a node would. */
const node: RpcClient = {
  async send<T>(method: string): Promise<T> {
    if (method === "state_getStorage") return `0x${RECENT.eventsHex}` as T;
    throw new Error(`unexpected ${method}`);
  },
  async close() {},
};
const truthOptions = (checked: IndexedRow[]) => ({
  client: node,
  spec,
  rows: checked,
  hashOf: async () => RECENT.hash,
  runtimeFor: async () => runtime(RECENT.postStateSpec),
});

describe("checkRowTruth (L2)", () => {
  it("accepts rows that exist on the source chain", async () => {
    expect(await checkRowTruth(truthOptions(rows))).toEqual([]);
  });

  it("returns altered and invented rows", async () => {
    const original = rows[0] as IndexedRow;
    const altered: IndexedRow = { ...original, cells: { ...original.cells, amount: "1" } };
    const invented: IndexedRow = { ...original, eventIndex: 999 };
    expect(await checkRowTruth(truthOptions([altered, invented, ...rows.slice(1)]))).toEqual([
      altered,
      invented,
    ]);
  });
});
