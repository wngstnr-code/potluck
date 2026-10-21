import type { Spec } from "@potluck/spec";
import { AccountBloom } from "./bloom.js";
import { encodeNdjson, encodeRow, rawHash } from "./encoding.js";
import type { IndexedRow } from "./engine.js";

/** TransactionStorage accepts at most 8,388,608 bytes per store; keep blobs below it. */
export const MAX_BLOB_BYTES = 8_388_608;

export interface ChunkPlan {
  fromBlock: number;
  toBlock: number;
  rows: IndexedRow[];
}

/**
 * Streaming chunk planner. Feed it each block's rows in block order; it returns chunks as soon as
 * they close. Rules: chunks are contiguous and cover the whole range; a block is never split; a
 * chunk closes before the next block WITH rows when that block is ≥ maxBlocks after the chunk start
 * or would push the chunk over maxRawBytes; a single block larger than maxRawBytes becomes its own
 * chunk; blocks without rows never close a chunk.
 *
 * Because boundaries depend only on the row sequence, a build resumed at a closed chunk's
 * `toBlock + 1` produces exactly the chunks an uninterrupted build would.
 */
export class ChunkAccumulator {
  #start: number;
  #current: IndexedRow[] = [];
  #bytes = 0;
  #lastBlock: number;

  constructor(
    private readonly spec: Spec,
    fromBlock: number,
  ) {
    this.#start = fromBlock;
    this.#lastBlock = fromBlock - 1;
  }

  /** Start block of the chunk currently being filled. */
  get start(): number {
    return this.#start;
  }

  /** Rows of the chunk currently being filled (not yet closed). */
  get pending(): readonly IndexedRow[] {
    return this.#current;
  }

  /**
   * Rebuilds an accumulator whose open chunk starts at `fromBlock`, holds `rows` and has seen every
   * block up to `scannedTo`, so a build can resume mid-chunk. Re-pushing the rows in order recreates
   * the exact state: they were accepted into one chunk before, so they cannot close it now.
   */
  static restore(
    spec: Spec,
    fromBlock: number,
    rows: readonly IndexedRow[],
    scannedTo: number,
  ): ChunkAccumulator {
    const accumulator = new ChunkAccumulator(spec, fromBlock);
    for (let i = 0; i < rows.length; ) {
      const block = (rows[i] as IndexedRow).block;
      const group: IndexedRow[] = [];
      while (i < rows.length && (rows[i] as IndexedRow).block === block)
        group.push(rows[i++] as IndexedRow);
      if (accumulator.push(block, group).length > 0) {
        throw new Error("restored rows do not belong to one open chunk");
      }
    }
    if (scannedTo < accumulator.#lastBlock) throw new Error("scannedTo precedes the restored rows");
    accumulator.#lastBlock = scannedTo;
    return accumulator;
  }

  /** Adds the rows of `block` (all with that block number; may be empty). */
  push(block: number, rows: readonly IndexedRow[]): ChunkPlan[] {
    if (block <= this.#lastBlock) throw new Error(`block #${block} pushed out of order`);
    this.#lastBlock = block;
    if (rows.length === 0) return [];
    let groupBytes = 0;
    for (const row of rows) {
      if (row.block !== block) throw new Error(`row of block #${row.block} pushed as #${block}`);
      groupBytes += encodeRow(this.spec, row).length + 1;
    }
    const closed: ChunkPlan[] = [];
    const { maxBlocks, maxRawBytes } = this.spec.chunk;
    if (
      this.#current.length > 0 &&
      (block - this.#start >= maxBlocks || this.#bytes + groupBytes > maxRawBytes)
    ) {
      closed.push({ fromBlock: this.#start, toBlock: block - 1, rows: this.#current });
      this.#start = block;
      this.#current = [];
      this.#bytes = 0;
    }
    this.#current.push(...rows);
    this.#bytes += groupBytes;
    return closed;
  }

  /** Closes the last chunk at `toBlock` (it may be empty). */
  finish(toBlock: number): ChunkPlan {
    if (toBlock < this.#lastBlock)
      throw new Error(`finish(#${toBlock}) before last block #${this.#lastBlock}`);
    const plan = { fromBlock: this.#start, toBlock, rows: this.#current };
    this.#current = [];
    this.#bytes = 0;
    return plan;
  }
}

/**
 * Splits sorted rows of [fromBlock, toBlock] into contiguous chunks covering the whole range
 * (see ChunkAccumulator for the rules). Ranges without rows still belong to a chunk.
 */
export function planChunks(
  spec: Spec,
  rows: readonly IndexedRow[],
  range: { fromBlock: number; toBlock: number },
): ChunkPlan[] {
  if (range.fromBlock > range.toBlock) throw new Error("planChunks: empty range");
  const accumulator = new ChunkAccumulator(spec, range.fromBlock);
  const plans: ChunkPlan[] = [];
  let i = 0;
  while (i < rows.length) {
    const block = (rows[i] as IndexedRow).block;
    if (block < range.fromBlock || block > range.toBlock) {
      throw new Error(`row at block #${block} is outside [${range.fromBlock}, ${range.toBlock}]`);
    }
    const group: IndexedRow[] = [];
    while (i < rows.length && (rows[i] as IndexedRow).block === block)
      group.push(rows[i++] as IndexedRow);
    plans.push(...accumulator.push(block, group));
  }
  plans.push(accumulator.finish(range.toBlock));
  return plans;
}

export interface BuiltChunk {
  fromBlock: number;
  toBlock: number;
  rows: number;
  /** Uncompressed canonical NDJSON. */
  raw: Uint8Array;
  rawHash: `0x${string}`;
  /** gzip(raw); what gets stored in TransactionStorage. */
  blob: Uint8Array;
  /** Distinct account ids appearing in the spec's account columns. */
  accounts: number;
  /** Base64 account bloom filter. */
  bloom: string;
}

export function chunkAccounts(spec: Spec, rows: readonly IndexedRow[]): Set<string> {
  const accounts = new Set<string>();
  for (const row of rows) {
    for (const column of spec.accounts) {
      const value = row.cells[column];
      if (value) accounts.add(value);
    }
  }
  return accounts;
}

export async function buildChunk(spec: Spec, plan: ChunkPlan): Promise<BuiltChunk> {
  const raw = encodeNdjson(spec, plan.rows);
  const blob = await gzip(raw);
  if (blob.length > MAX_BLOB_BYTES) {
    throw new Error(
      `chunk [${plan.fromBlock}, ${plan.toBlock}] compresses to ${blob.length} bytes (> ${MAX_BLOB_BYTES}); lower maxRawBytes`,
    );
  }
  const accounts = chunkAccounts(spec, plan.rows);
  return {
    fromBlock: plan.fromBlock,
    toBlock: plan.toBlock,
    rows: plan.rows.length,
    raw,
    rawHash: rawHash(raw),
    blob,
    accounts: accounts.size,
    bloom: AccountBloom.of(accounts).toBase64(),
  };
}

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const response = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

/** gzip via the Compression Streams API (Node ≥ 18 and all modern browsers). */
export function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream("gzip"));
}

export function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream("gzip"));
}
