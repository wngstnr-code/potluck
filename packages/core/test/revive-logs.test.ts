import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpec, type Spec } from "@potluck/spec";
import { describe, expect, it } from "vitest";
import { compileSpec, eventsToRows } from "../src/engine.js";
import { decodeEvents } from "../src/events.js";
import { balanceDeltas } from "../src/reconcile.js";
import { portaldotRuntime, portaldotV3 } from "./fixtures.js";

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
const compiled = compileSpec(spec);
const rowsOf = (s: Spec, block: (typeof portaldotV3.blocks)[number]) =>
  eventsToRows(
    compileSpec(s),
    decodeEvents(portaldotRuntime(block.executingSpec), block.number, `0x${block.eventsHex}`),
  );
const topicAddress = (topic: string) => `0x${topic.slice(26)}`.toLowerCase();

describe("unified history on real Portaldot V3 blocks", () => {
  it("has the recorded genesis", () => {
    expect(spec.source.genesisHash).toBe(portaldotV3.genesisHash);
  });

  for (const block of portaldotV3.blocks) {
    it(`block #${block.number}: token rows equal eth_getLogs exactly (ERC-20 + ERC-721)`, () => {
      const rows = eventsToRows(
        compiled,
        decodeEvents(portaldotRuntime(block.executingSpec), block.number, `0x${block.eventsHex}`),
      );
      const tokenRows = rows.filter((r) => r.cells.asset !== "native");
      // eth_getLogs with the Transfer selector returns both shapes (3 topics = ERC-20, 4 = ERC-721)
      // in eth-rpc log order; Potluck keeps System.Events order, so compare as multisets.
      const fromRows = tokenRows
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
      const fromLogs = block.ethTransferLogs
        .map((log) => {
          const erc20 = log.topics.length === 3;
          return [
            erc20 ? "Erc20Transfer" : "Erc721Transfer",
            log.address.toLowerCase(),
            topicAddress(log.topics[1] as string),
            topicAddress(log.topics[2] as string),
            erc20 ? BigInt(log.data).toString() : "",
            erc20 ? "" : BigInt(log.topics[3] as string).toString(),
          ].join("|");
        })
        .sort();
      expect(fromRows).toEqual(fromLogs);
    });

    it(`block #${block.number}: native rows are AccountId32 hex with asset "native"`, () => {
      const rows = rowsOf(spec, block);
      const native = rows.filter((r) => r.cells.asset === "native");
      expect(native.length).toBeGreaterThan(0);
      for (const row of native) {
        for (const account of [row.cells.from, row.cells.to]) {
          if (account !== null) expect(account).toMatch(/^0x[0-9a-f]{64}$/);
        }
      }
    });
  }

  it("reconciliation deltas ignore ERC-20 rows (when asset == native)", () => {
    const block = portaldotV3.blocks[0] as (typeof portaldotV3.blocks)[number];
    const rows = rowsOf(spec, block);
    const { expectations } = balanceDeltas(spec, rows);
    for (const row of rows.filter((r) => r.cells.kind === "Erc20Transfer")) {
      if (row.cells.to) expect(expectations.has(row.cells.to)).toBe(false);
    }
    const nativeOnly = balanceDeltas(
      spec,
      rows.filter((r) => r.cells.asset === "native"),
    ).expectations;
    expect(expectations).toEqual(nativeOnly);
  });

  it("respects the contracts filter and the indexed-topic count", () => {
    const block = portaldotV3.blocks[0] as (typeof portaldotV3.blocks)[number];
    const other = `0x${"11".repeat(20)}`;
    const filtered: Spec = {
      ...spec,
      match: [
        {
          log: "Transfer(address indexed from, address indexed to, uint256 value)",
          contracts: [other],
          row: { kind: "Erc20Transfer" },
        },
      ],
    };
    expect(rowsOf(filtered, block)).toEqual([]);
    const erc721: Spec = {
      ...spec,
      match: [
        {
          log: "Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
          row: { kind: "Erc721Transfer" },
        },
      ],
    };
    const nftLogs = block.ethTransferLogs.filter((l) => l.topics.length === 4);
    expect(rowsOf(erc721, block).length).toBe(nftLogs.length);
    expect(nftLogs.length).toBeGreaterThan(0);
  });
});
