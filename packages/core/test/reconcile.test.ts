import { readFileSync } from "node:fs";
import { join } from "node:path";
import { u8aConcat, u8aToHex } from "@polkadot/util";
import { blake2AsU8a, xxhashAsU8a } from "@polkadot/util-crypto";
import { parseSpec } from "@potluck/spec";
import { describe, expect, it } from "vitest";
import { compileSpec, eventsToRows, type IndexedRow } from "../src/engine.js";
import { decodeEvents } from "../src/events.js";
import { balanceDeltas, storageMapKey } from "../src/reconcile.js";
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

describe("balanceDeltas on real rows", () => {
  it("debits `from`, credits `to`, and conserves value across transfers", () => {
    const { expectations, opaque } = balanceDeltas(spec, rows);
    expect(opaque.size).toBe(0);
    let expectedNet = 0n;
    for (const row of rows) {
      const amount = BigInt(row.cells.amount as string);
      if (row.cells.from && !row.cells.to) expectedNet -= amount;
      if (row.cells.to && !row.cells.from) expectedNet += amount;
    }
    const net = [...expectations.values()].reduce((a, e) => a + e.delta, 0n);
    expect(net).toBe(expectedNet);
    for (const row of rows) {
      if (row.cells.from) expect(expectations.has(row.cells.from)).toBe(true);
      if (row.cells.to) expect(expectations.has(row.cells.to)).toBe(true);
    }
  });

  it("excludes accounts touched by opaque rows", () => {
    const account = (rows[0]?.cells.from ?? rows[0]?.cells.to) as string;
    const opaqueRow: IndexedRow = {
      block: RECENT.number + 1,
      eventIndex: 0,
      cells: { kind: "BalanceSet", from: null, to: account, amount: "1" },
      effect: "opaque",
    };
    expect(balanceDeltas(spec, [...rows, opaqueRow]).opaque.has(account)).toBe(true);
  });

  it("rejects specs without a balance-delta rule", () => {
    expect(() => balanceDeltas({ ...spec, reconcile: { type: "none" } }, rows)).toThrow(
      "no balance-delta rule",
    );
  });
});

describe("reset rows (System.KilledAccount)", () => {
  const A = `0x${"0a".repeat(32)}`;
  const B = `0x${"0b".repeat(32)}`;
  const r = (
    block: number,
    eventIndex: number,
    cells: Partial<IndexedRow["cells"]>,
    effect: IndexedRow["effect"] = "delta",
  ): IndexedRow => ({
    block,
    eventIndex,
    cells: { kind: "x", from: null, to: null, amount: "0", ...cells },
    effect,
  });

  it("resets at the end of its block: same-block rows are part of the reset, later rows count", () => {
    const { expectations } = balanceDeltas(spec, [
      r(10, 0, { to: A, amount: "500" }),
      // Recorded Portaldot order: KilledAccount is emitted before the emptying Transfer.
      r(11, 2, { to: A, amount: "0" }, "reset"),
      r(11, 3, { from: A, to: B, amount: "460" }),
      r(12, 0, { to: A, amount: "7" }),
    ]);
    expect(expectations.get(A)).toEqual({ reset: { block: 11, value: 0n }, delta: 7n });
    expect(expectations.get(B)).toEqual({ delta: 460n });
  });

  it("uses only the last reset", () => {
    const { expectations } = balanceDeltas(spec, [
      r(5, 0, { to: A, amount: "0" }, "reset"),
      r(6, 0, { to: A, amount: "9" }),
      r(8, 0, { to: A, amount: "0" }, "reset"),
      r(9, 0, { from: A, amount: "2" }),
    ]);
    expect(expectations.get(A)).toEqual({ reset: { block: 8, value: 0n }, delta: -2n });
  });
});

describe("storageMapKey", () => {
  it("builds System.Account keys with the metadata hasher (Blake2_128Concat)", () => {
    const account = `0x${"42".repeat(32)}`;
    const id = Buffer.from("42".repeat(32), "hex");
    const expected = u8aToHex(
      u8aConcat(xxhashAsU8a("System", 128), xxhashAsU8a("Account", 128), blake2AsU8a(id, 128), id),
    );
    expect(storageMapKey(runtime(RECENT.postStateSpec), "System", "Account", account)).toBe(
      expected,
    );
  });

  it("rejects plain storage items", () => {
    expect(() => storageMapKey(runtime(RECENT.postStateSpec), "System", "Number", "0x00")).toThrow(
      "not a map",
    );
  });
});
