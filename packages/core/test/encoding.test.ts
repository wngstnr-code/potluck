import { readFileSync } from "node:fs";
import { join } from "node:path";
import { u8aConcat, u8aToHex } from "@polkadot/util";
import { blake2AsHex, keccakAsU8a } from "@polkadot/util-crypto";
import { parseSpec } from "@potluck/spec";
import { describe, expect, it } from "vitest";
import {
  decodeNdjson,
  encodeNdjson,
  encodeRow,
  merkleProof,
  merkleRoot,
  rawHash,
  verifyMerkleProof,
} from "../src/encoding.js";
import { compileSpec, eventsToRows, type IndexedRow } from "../src/engine.js";
import { decodeEvents } from "../src/events.js";
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
const realRows = () =>
  eventsToRows(
    compileSpec(spec),
    decodeEvents(runtime(RECENT.postStateSpec), RECENT.number, `0x${RECENT.eventsHex}`),
  );

const row = (overrides: Partial<IndexedRow> = {}): IndexedRow => ({
  block: 10,
  eventIndex: 2,
  cells: { kind: "Transfer", from: `0x${"aa".repeat(32)}`, to: null, amount: "5" },
  effect: "delta",
  ...overrides,
});

describe("canonical NDJSON", () => {
  it("encodes keys in fixed order without whitespace", () => {
    expect(encodeRow(spec, row())).toBe(
      `{"block":10,"eventIndex":2,"kind":"Transfer","from":"0x${"aa".repeat(32)}","to":null,"amount":"5"}`,
    );
    expect(encodeRow(spec, row({ effect: "reset" }))).toMatch(/,"effect":"reset"}$/);
    expect(encodeRow(spec, row({ effect: "opaque" }))).toMatch(/,"effect":"opaque"}$/);
  });

  it("round-trips real rows byte-for-byte", () => {
    const rows = realRows();
    const bytes = encodeNdjson(spec, rows);
    expect(decodeNdjson(spec, bytes)).toEqual(rows);
    expect(encodeNdjson(spec, decodeNdjson(spec, bytes))).toEqual(bytes);
  });

  it("rejects unsorted rows", () => {
    expect(() => encodeNdjson(spec, [row({ eventIndex: 3 }), row({ eventIndex: 3 })])).toThrow(
      "not strictly ordered",
    );
    expect(() => encodeNdjson(spec, [row({ block: 11 }), row({ block: 10 })])).toThrow(
      "not strictly ordered",
    );
  });

  it("rejects non-canonical input", () => {
    const enc = new TextEncoder();
    const good = encodeRow(spec, row());
    expect(() => decodeNdjson(spec, enc.encode(good))).toThrow("newline");
    const reordered = `{"eventIndex":2,"block":10${good.slice(good.indexOf(',"kind"'))}\n`;
    expect(() => decodeNdjson(spec, enc.encode(reordered))).toThrow("not canonical");
    const spaced = `${good.replace('"block":10', '"block": 10')}\n`;
    expect(() => decodeNdjson(spec, enc.encode(spaced))).toThrow("not canonical");
    const extraKey = `${good.slice(0, -1)},"extra":"x"}\n`;
    expect(() => decodeNdjson(spec, enc.encode(extraKey))).toThrow("not canonical");
    const numberCell = `${good.replace('"amount":"5"', '"amount":5')}\n`;
    expect(() => decodeNdjson(spec, enc.encode(numberCell))).toThrow("bad cell amount");
  });

  it("handles empty chunks", () => {
    expect(encodeNdjson(spec, [])).toEqual(new Uint8Array());
    expect(decodeNdjson(spec, new Uint8Array())).toEqual([]);
  });
});

describe("rawHash", () => {
  it("is blake2b-256 of the bytes and is stable across encodings of the same rows", () => {
    const a = encodeNdjson(spec, realRows());
    const b = encodeNdjson(spec, decodeNdjson(spec, a));
    expect(rawHash(a)).toBe(blake2AsHex(a, 256));
    expect(rawHash(b)).toBe(rawHash(a));
  });
});

describe("merkle", () => {
  const leaves = Array.from({ length: 5 }, (_, i) => blake2AsHex(`chunk-${i}`, 256));
  const k = (a: string, b: string) =>
    u8aToHex(
      keccakAsU8a(u8aConcat(Buffer.from(a.slice(2), "hex"), Buffer.from(b.slice(2), "hex")), 256),
    );

  it("matches a hand-computed tree with a promoted odd node", () => {
    const [l0, l1, l2, l3, l4] = leaves as [string, string, string, string, string];
    const expected = k(k(k(l0, l1), k(l2, l3)), l4);
    expect(merkleRoot(leaves)).toBe(expected);
  });

  it("handles 0 and 1 leaves", () => {
    expect(merkleRoot([])).toBe(`0x${"00".repeat(32)}`);
    expect(merkleRoot([leaves[0] as string])).toBe(leaves[0]);
  });

  it("produces proofs that verify for every leaf and fail when tampered", () => {
    const root = merkleRoot(leaves);
    leaves.forEach((leaf, i) => {
      const proof = merkleProof(leaves, i);
      expect(verifyMerkleProof(leaf, i, proof, root)).toBe(true);
      expect(verifyMerkleProof(blake2AsHex("forged", 256), i, proof, root)).toBe(false);
    });
    expect(() => merkleProof(leaves, 5)).toThrow("out of range");
  });

  it("rejects leaves that are not 32 bytes", () => {
    expect(() => merkleRoot(["0x1234"])).toThrow("32 bytes");
  });
});
