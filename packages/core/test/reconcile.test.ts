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
    const { deltas, absolute } = balanceDeltas(spec, rows);
    expect(absolute.size).toBe(0);
    let expectedNet = 0n;
    for (const row of rows) {
      const amount = BigInt(row.cells.amount as string);
      if (row.cells.from && !row.cells.to) expectedNet -= amount;
      if (row.cells.to && !row.cells.from) expectedNet += amount;
    }
    const net = [...deltas.values()].reduce((a, b) => a + b, 0n);
    expect(net).toBe(expectedNet);
    for (const row of rows) {
      if (row.cells.from) expect(deltas.has(row.cells.from)).toBe(true);
      if (row.cells.to) expect(deltas.has(row.cells.to)).toBe(true);
    }
  });

  it("excludes accounts touched by absolute rows", () => {
    const account = rows[0]?.cells.from ?? rows[0]?.cells.to;
    const abs: IndexedRow = {
      block: RECENT.number + 1,
      eventIndex: 0,
      cells: { kind: "BalanceSet", from: null, to: account ?? null, amount: "1" },
      absolute: true,
    };
    const { deltas, absolute } = balanceDeltas(spec, [...rows, abs]);
    expect(absolute.has(account as string)).toBe(true);
    expect(deltas.get(account as string)).toBe(
      balanceDeltas(spec, rows).deltas.get(account as string),
    );
  });

  it("rejects specs without a balance-delta rule", () => {
    expect(() => balanceDeltas({ ...spec, reconcile: { type: "none" } }, rows)).toThrow(
      "no balance-delta rule",
    );
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
