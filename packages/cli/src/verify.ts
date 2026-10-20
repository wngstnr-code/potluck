import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { blake2AsHex } from "@polkadot/util-crypto";
import {
  AccountBloom,
  buildRuntimeMap,
  chunkAccounts,
  compileSpec,
  connectWs,
  type DecodingRuntime,
  decodeEvents,
  decodeNdjson,
  encodeNdjson,
  eventsToRows,
  getBlockHashes,
  getGenesisHash,
  gunzip,
  type IndexedRow,
  type ManifestChunk,
  parseManifest,
  type RpcClient,
  RuntimeLoader,
  rawHash,
  reconcileAccounts,
  scanRawEvents,
  withRetry,
} from "@potluck/core";
import { parseSpec, type Spec, specHash } from "@potluck/spec";
import { KNOWN_ENDPOINTS } from "./config.js";
import { FileMetadataStore } from "./metadata-store.js";

export interface VerifyOptions {
  dir: string;
  endpoint?: string;
  /** Chunk indexes to verify (default: all). */
  chunks?: number[];
  /** Re-index each chunk's range from the source chain and compare raw hashes. */
  rebuild: boolean;
  /** Reconcile accounts against source-chain state (L3) when the spec has a balance rule. */
  reconcile: boolean;
  concurrency: number;
  log: (line: string) => void;
}

export interface ChunkReport {
  index: number;
  integrity: string[];
  rebuild?: "match" | "mismatch";
  reconciled?: { ok: number; total: number; failures: string[] };
}

/** Indexes [fromBlock, toBlock] from the source chain into rows (in memory: one chunk at a time). */
export async function indexRange(
  client: RpcClient,
  spec: Spec,
  loader: RuntimeLoader,
  fromBlock: number,
  toBlock: number,
  concurrency: number,
): Promise<{
  rows: IndexedRow[];
  runtimeFor: (block: number) => Promise<DecodingRuntime>;
  hashOf: (block: number) => Promise<string>;
}> {
  const known = new Map<number, string>();
  const hashOf = async (block: number) =>
    known.get(block) ?? ((await getBlockHashes(client, [block]))[0] as string);
  const map = await buildRuntimeMap(client, fromBlock, toBlock, { hashOf });
  const runtimeFor = async (block: number) =>
    loader.load(map.executingVersion(block), await hashOf(block === 0 ? 0 : block - 1));
  const scan = await scanRawEvents(client, fromBlock, toBlock, { concurrency });
  for (const b of scan.blocks) known.set(b.block, b.hash);
  const compiled = compileSpec(spec);
  const rows: IndexedRow[] = [];
  for (const { block, raw } of scan.blocks) {
    if (raw.length === 0) continue;
    rows.push(...eventsToRows(compiled, decodeEvents(await runtimeFor(block), block, raw)));
  }
  return { rows, runtimeFor, hashOf };
}

/** L1: blob digest, raw hash, canonical NDJSON, rows inside the chunk range, bloom coverage. */
export async function checkChunkIntegrity(
  spec: Spec,
  chunk: ManifestChunk,
  blob: Uint8Array,
): Promise<{ problems: string[]; rows: IndexedRow[] }> {
  const problems: string[] = [];
  if (blake2AsHex(blob, 256) !== chunk.blob.digest) problems.push("blob digest mismatch");
  if (blob.length !== chunk.blob.size) problems.push("blob size mismatch");
  const raw = await gunzip(blob);
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

export async function runVerify(options: VerifyOptions): Promise<ChunkReport[]> {
  const spec = parseSpec(JSON.parse(await readFile(join(options.dir, "spec.json"), "utf8")));
  const manifestFile = await readFile(join(options.dir, "manifest.draft.json")).catch(() =>
    readFile(join(options.dir, "manifest.json")),
  );
  const manifest = parseManifest(new Uint8Array(manifestFile));
  if (manifest.spec !== specHash(spec))
    throw new Error("manifest spec hash does not match spec.json");
  const indexes = options.chunks ?? manifest.chunks.map((_, i) => i);
  const needsChain =
    options.rebuild || (options.reconcile && spec.reconcile.type === "balance-delta");

  let client: RpcClient | undefined;
  let loader: RuntimeLoader | undefined;
  if (needsChain) {
    const endpoint = options.endpoint ?? KNOWN_ENDPOINTS[spec.source.chain];
    if (!endpoint) throw new Error(`no endpoint for chain "${spec.source.chain}"; pass --endpoint`);
    client = withRetry(await connectWs(endpoint));
    const genesis = await getGenesisHash(client);
    if (genesis.toLowerCase() !== spec.source.genesisHash)
      throw new Error("endpoint genesis mismatch");
    loader = new RuntimeLoader(
      client,
      new FileMetadataStore(join(".cache", "potluck", "metadata", genesis)),
    );
  }

  const reports: ChunkReport[] = [];
  try {
    for (const index of indexes) {
      const chunk = manifest.chunks[index];
      if (!chunk) throw new Error(`no chunk ${index}`);
      const blob = new Uint8Array(
        await readFile(join(options.dir, "chunks", `${index}.ndjson.gz`)),
      );
      const { problems, rows } = await checkChunkIntegrity(spec, chunk, blob);
      const report: ChunkReport = { index, integrity: problems };
      let context: Awaited<ReturnType<typeof indexRange>> | undefined;
      if (client && loader && options.rebuild) {
        context = await indexRange(
          client,
          spec,
          loader,
          chunk.fromBlock,
          chunk.toBlock,
          options.concurrency,
        );
        report.rebuild =
          rawHash(encodeNdjson(spec, context.rows)) === chunk.rawHash ? "match" : "mismatch";
      }
      if (client && loader && options.reconcile && spec.reconcile.type === "balance-delta") {
        const known = new Map<number, string>();
        const hashOf =
          context?.hashOf ??
          (async (b: number) =>
            known.get(b) ?? ((await getBlockHashes(client as RpcClient, [b]))[0] as string));
        const map = context
          ? undefined
          : await buildRuntimeMap(client, chunk.fromBlock, chunk.toBlock, { hashOf });
        const runtimeFor =
          context?.runtimeFor ??
          (async (b: number) =>
            (loader as RuntimeLoader).load(
              (map as NonNullable<typeof map>).executingVersion(b),
              await hashOf(b === 0 ? 0 : b - 1),
            ));
        const results = await reconcileAccounts({
          client,
          spec,
          rows,
          fromBlock: chunk.fromBlock,
          toBlock: chunk.toBlock,
          hashOf,
          runtimeFor,
          concurrency: options.concurrency,
        });
        const failures = results.filter((r) => !r.ok);
        report.reconciled = {
          ok: results.length - failures.length,
          total: results.length,
          failures: failures
            .slice(0, 10)
            .map((f) => `${f.account}: expected Δ${f.expectedDelta}, actual Δ${f.actualDelta}`),
        };
      }
      options.log(
        `chunk ${index} #${chunk.fromBlock}..#${chunk.toBlock}: integrity ${problems.length === 0 ? "ok" : problems.join(", ")}` +
          (report.rebuild ? `, rebuild ${report.rebuild}` : "") +
          (report.reconciled
            ? `, reconciled ${report.reconciled.ok}/${report.reconciled.total}`
            : ""),
      );
      for (const failure of report.reconciled?.failures ?? []) options.log(`  ✗ ${failure}`);
      reports.push(report);
    }
  } finally {
    await client?.close();
  }
  return reports;
}

export function reportsOk(reports: readonly ChunkReport[]): boolean {
  return reports.every(
    (r) =>
      r.integrity.length === 0 &&
      r.rebuild !== "mismatch" &&
      (r.reconciled === undefined || r.reconciled.ok === r.reconciled.total),
  );
}
