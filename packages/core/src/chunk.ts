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
 * Splits sorted rows of [fromBlock, toBlock] into contiguous chunks that together cover the whole
 * range. A block is never split. A chunk is closed before the next block with rows when that
 * block is ≥ maxBlocks after the chunk start or would push the chunk over maxRawBytes; a single
 * block larger than maxRawBytes becomes its own chunk. Ranges without rows still belong to a chunk
 * (possibly empty), so coverage is explicit.
 */
export function planChunks(
  spec: Spec,
  rows: readonly IndexedRow[],
  range: { fromBlock: number; toBlock: number },
): ChunkPlan[] {
  if (range.fromBlock > range.toBlock) throw new Error("planChunks: empty range");
  const { maxBlocks, maxRawBytes } = spec.chunk;
  const plans: ChunkPlan[] = [];
  let start = range.fromBlock;
  let current: IndexedRow[] = [];
  let bytes = 0;

  let i = 0;
  while (i < rows.length) {
    const block = (rows[i] as IndexedRow).block;
    if (block < range.fromBlock || block > range.toBlock) {
      throw new Error(`row at block #${block} is outside [${range.fromBlock}, ${range.toBlock}]`);
    }
    const group: IndexedRow[] = [];
    let groupBytes = 0;
    while (i < rows.length && (rows[i] as IndexedRow).block === block) {
      groupBytes += encodeRow(spec, rows[i] as IndexedRow).length + 1;
      group.push(rows[i] as IndexedRow);
      i++;
    }
    if (current.length > 0 && (block - start >= maxBlocks || bytes + groupBytes > maxRawBytes)) {
      plans.push({ fromBlock: start, toBlock: block - 1, rows: current });
      start = block;
      current = [];
      bytes = 0;
    }
    current.push(...group);
    bytes += groupBytes;
  }
  plans.push({ fromBlock: start, toBlock: range.toBlock, rows: current });
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
