import { blake2AsHex } from "@polkadot/util-crypto";
import type { Spec } from "@potluck/spec";
import { AccountBloom } from "./bloom.js";
import { chunkAccounts, gunzip } from "./chunk.js";
import { decodeNdjson, encodeRow, rawHash } from "./encoding.js";
import { compileSpec, eventsToRows, type IndexedRow } from "./engine.js";
import { decodeEvents, fetchRawEvents } from "./events.js";
import type { ManifestChunk } from "./manifest.js";
import { mapPool, type RpcClient } from "./rpc.js";
import type { DecodingRuntime } from "./runtime.js";

/**
 * L1 integrity of one chunk blob against its manifest entry: blob digest and size, raw hash,
 * canonical NDJSON, row count, rows inside the chunk range, account count and bloom coverage.
 * A forgery with consistently recomputed hashes passes L1; L2/L3 against the source chain catch it.
 */
export async function checkChunkIntegrity(
  spec: Spec,
  chunk: ManifestChunk,
  blob: Uint8Array,
): Promise<{ problems: string[]; rows: IndexedRow[] }> {
  const problems: string[] = [];
  if (blake2AsHex(blob, 256) !== chunk.blob.digest) problems.push("blob digest mismatch");
  if (blob.length !== chunk.blob.size) problems.push("blob size mismatch");
  let raw: Uint8Array;
  try {
    raw = await gunzip(blob);
  } catch {
    return { problems: [...problems, "blob is not gzip"], rows: [] };
  }
  if (rawHash(raw) !== chunk.rawHash) problems.push("raw hash mismatch");
  let rows: IndexedRow[] = [];
  try {
    rows = decodeNdjson(spec, raw);
  } catch (error) {
    problems.push(`non-canonical NDJSON: ${(error as Error).message}`);
  }
  if (rows.length !== chunk.rows) problems.push(`row count ${rows.length} != ${chunk.rows}`);
  if (rows.some((r) => r.block < chunk.fromBlock || r.block > chunk.toBlock)) {
    problems.push("row outside the chunk range");
  }
  const bloom = AccountBloom.fromBase64(chunk.bloom);
  const accounts = chunkAccounts(spec, rows);
  if (accounts.size !== chunk.accounts)
    problems.push(`account count ${accounts.size} != ${chunk.accounts}`);
  for (const account of accounts) {
    if (!bloom.has(account)) {
      problems.push(`bloom misses ${account}`);
      break;
    }
  }
  return { problems, rows };
}

export interface RowTruthOptions {
  client: RpcClient;
  spec: Spec;
  /** Rows to check (e.g. one account's rows); each block they touch is re-derived. */
  rows: readonly IndexedRow[];
  hashOf: (block: number) => Promise<string>;
  /** Runtime that executed `block`. */
  runtimeFor: (block: number) => Promise<DecodingRuntime>;
  concurrency?: number;
}

/**
 * L2 row truth: re-derives every block the given rows touch from the source chain and checks that
 * each given row exists there byte-for-byte (same event index and cells). Returns the rows that do
 * not (forged or altered). Detects invented and modified rows; omissions are L3's job.
 */
export async function checkRowTruth(options: RowTruthOptions): Promise<IndexedRow[]> {
  const compiled = compileSpec(options.spec);
  const blocks = [...new Set(options.rows.map((r) => r.block))];
  const truth = new Map<number, Set<string>>();
  await mapPool(blocks, options.concurrency ?? 16, async (block) => {
    const raw = await fetchRawEvents(options.client, await options.hashOf(block));
    const rows = eventsToRows(compiled, decodeEvents(await options.runtimeFor(block), block, raw));
    truth.set(block, new Set(rows.map((r) => encodeRow(options.spec, r))));
  });
  return options.rows.filter((r) => !truth.get(r.block)?.has(encodeRow(options.spec, r)));
}
