import { u8aConcat, u8aToHex } from "@polkadot/util";
import { blake2AsHex, keccakAsU8a } from "@polkadot/util-crypto";
import type { Spec } from "@potluck/spec";
import type { Cell, IndexedRow } from "./engine.js";
import { hexToBytes } from "./runtime.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Canonical row line: a JSON object with keys in this exact order —
 * `block`, `eventIndex`, the spec columns in declared order, then `"effect":"reset"|"opaque"` only
 * for non-delta rows — no whitespace. Two honest publishers therefore produce identical bytes.
 */
export function encodeRow(spec: Spec, row: IndexedRow): string {
  let line = `{"block":${row.block},"eventIndex":${row.eventIndex}`;
  for (const column of spec.columns) {
    const cell = row.cells[column];
    line += `,${JSON.stringify(column)}:${cell === null || cell === undefined ? "null" : JSON.stringify(cell)}`;
  }
  if (row.effect !== "delta") line += `,"effect":${JSON.stringify(row.effect)}`;
  return `${line}}`;
}

/** NDJSON bytes: one canonical line per row, each terminated by "\n". Rows must be sorted. */
export function encodeNdjson(spec: Spec, rows: readonly IndexedRow[]): Uint8Array {
  let out = "";
  let previous: IndexedRow | undefined;
  for (const row of rows) {
    if (
      previous &&
      (row.block < previous.block ||
        (row.block === previous.block && row.eventIndex <= previous.eventIndex))
    ) {
      throw new Error(`rows not strictly ordered at block #${row.block} event ${row.eventIndex}`);
    }
    out += `${encodeRow(spec, row)}\n`;
    previous = row;
  }
  return encoder.encode(out);
}

/**
 * Parses NDJSON produced by `encodeNdjson` and rejects anything non-canonical: every line is
 * re-encoded and must match byte-for-byte, so a chunk cannot smuggle in extra keys, reordered
 * keys, other number formats or unsorted rows.
 */
export function decodeNdjson(spec: Spec, bytes: Uint8Array): IndexedRow[] {
  const text = decoder.decode(bytes);
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) throw new Error("NDJSON must end with a newline");
  const rows: IndexedRow[] = [];
  const lines = text.slice(0, -1).split("\n");
  for (const [i, line] of lines.entries()) {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const cells: Record<string, Cell> = {};
    for (const column of spec.columns) {
      const value = parsed[column];
      if (value !== null && typeof value !== "string")
        throw new Error(`line ${i + 1}: bad cell ${column}`);
      cells[column] = value as Cell;
    }
    const row: IndexedRow = {
      block: parsed.block as number,
      eventIndex: parsed.eventIndex as number,
      cells,
      effect: parsed.effect === "reset" || parsed.effect === "opaque" ? parsed.effect : "delta",
    };
    if (encodeRow(spec, row) !== line) throw new Error(`line ${i + 1}: not canonical`);
    rows.push(row);
  }
  encodeNdjson(spec, rows); // re-checks ordering
  return rows;
}

/** blake2b-256 over the uncompressed NDJSON bytes; identical across honest publishers. */
export function rawHash(bytes: Uint8Array): `0x${string}` {
  return blake2AsHex(bytes, 256) as `0x${string}`;
}

const ZERO_HASH = `0x${"00".repeat(32)}` as const;

function hashPair(left: Uint8Array, right: Uint8Array): Uint8Array {
  return keccakAsU8a(u8aConcat(left, right), 256);
}

function nextLevel(level: Uint8Array[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < level.length; i += 2) {
    const left = level[i] as Uint8Array;
    const right = level[i + 1];
    out.push(right ? hashPair(left, right) : left); // odd node is promoted unchanged
  }
  return out;
}

/**
 * Binary Merkle root over 32-byte leaves (the chunks' raw hashes, in chunk order):
 * parent = keccak256(left ++ right); an odd last node is promoted unchanged; a single leaf is its
 * own root; no leaves → zero hash. Chosen to be cheap to verify in Solidity later.
 */
export function merkleRoot(leaves: readonly string[]): `0x${string}` {
  if (leaves.length === 0) return ZERO_HASH;
  let level = leaves.map(leafBytes);
  while (level.length > 1) level = nextLevel(level);
  return u8aToHex(level[0]) as `0x${string}`;
}

/** Sibling hashes from leaf to root; `null` marks a level where the node was promoted. */
export function merkleProof(leaves: readonly string[], index: number): (`0x${string}` | null)[] {
  if (index < 0 || index >= leaves.length) throw new Error(`leaf ${index} out of range`);
  let level = leaves.map(leafBytes);
  let position = index;
  const proof: (`0x${string}` | null)[] = [];
  while (level.length > 1) {
    const sibling = level[position ^ 1];
    proof.push(sibling ? (u8aToHex(sibling) as `0x${string}`) : null);
    level = nextLevel(level);
    position = Math.floor(position / 2);
  }
  return proof;
}

export function verifyMerkleProof(
  leaf: string,
  index: number,
  proof: readonly (string | null)[],
  root: string,
): boolean {
  let node = leafBytes(leaf);
  let position = index;
  for (const sibling of proof) {
    if (sibling !== null) {
      const s = leafBytes(sibling);
      node = position % 2 === 0 ? hashPair(node, s) : hashPair(s, node);
    }
    position = Math.floor(position / 2);
  }
  return u8aToHex(node) === root.toLowerCase();
}

function leafBytes(hex: string): Uint8Array {
  const bytes = hexToBytes(hex);
  if (bytes.length !== 32) throw new Error(`merkle leaf must be 32 bytes, got ${bytes.length}`);
  return bytes;
}
