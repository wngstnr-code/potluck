import {
  type AccountReconciliation,
  buildRuntimeMap,
  checkChunkIntegrity,
  compileSpec,
  type DecodingRuntime,
  decodeEvents,
  eventsToRows,
  getBlockHashes,
  getFinalizedHead,
  type IndexedRow,
  type MetadataStore,
  type RpcClient,
  RuntimeLoader,
  reconcileAccounts,
  scanRawEvents,
} from "@potluck/core";
import type { Spec } from "@potluck/spec";
import { type CoverageSegment, planCoverage } from "./coverage.js";
import type { ManifestSource } from "./source.js";

export interface SpecHistoryOptions {
  spec: Spec;
  /** Source-chain RPC (archive). */
  source: RpcClient;
  /** Where published manifests come from; omit to sync everything directly. */
  manifests?: ManifestSource;
  fromBlock?: number;
  /** Defaults to the source chain's finalized head. */
  toBlock?: number;
  /** Gaps longer than this are reported as uncovered (default: no limit). */
  maxDirectBlocks?: number;
  /** Blocks per direct-sync step; rows are reported after each step (default 5,000). */
  stepBlocks?: number;
  concurrency?: number;
  metadataStore?: MetadataStore;
  /** Called as soon as rows are available, in block order. */
  onRows?: (rows: IndexedRow[], upToBlock: number) => void;
  onProgress?: (event: SpecProgressEvent) => void;
  signal?: AbortSignal;
}

export type SpecProgressEvent =
  | {
      type: "plan";
      segments: { mode: CoverageSegment["mode"]; fromBlock: number; toBlock: number }[];
    }
  | { type: "blocks"; done: number; total: number }
  | { type: "chunk"; done: number; total: number };

export interface SpecSegmentReport {
  mode: CoverageSegment["mode"];
  fromBlock: number;
  toBlock: number;
  manifestDigest?: string;
  chunks: number;
  integrityProblems: string[];
  rows: number;
  ms: number;
}

/** A loaded history plus what is needed to verify it against the source chain later. */
export interface SpecHistory {
  spec: Spec;
  head: number;
  fromBlock: number;
  toBlock: number;
  rows: IndexedRow[];
  segments: SpecSegmentReport[];
  uncovered: { fromBlock: number; toBlock: number }[];
  /** True when every downloaded chunk passed L1 (direct segments have nothing to check). */
  integrityOk: boolean;
  ms: number;
  hashOf: (block: number) => Promise<string>;
  runtimeFor: (block: number) => Promise<DecodingRuntime>;
}

/**
 * Loads every row of a spec over a range: published snapshots where available (all chunks,
 * each checked with L1), direct sync from the source chain elsewhere. Rows stream out through
 * `onRows`; call `reconcileHistory` afterwards for L3.
 */
export async function specHistory(options: SpecHistoryOptions): Promise<SpecHistory> {
  const started = Date.now();
  const { spec, source } = options;
  const head = (await getFinalizedHead(source)).number;
  const fromBlock = Math.max(options.fromBlock ?? spec.source.fromBlock, spec.source.fromBlock);
  const toBlock = Math.min(options.toBlock ?? head, head);
  const entries = options.manifests ? await options.manifests.list(spec) : [];
  const plan = planCoverage(
    entries,
    { fromBlock, toBlock },
    { maxDirectBlocks: options.maxDirectBlocks ?? Number.POSITIVE_INFINITY },
  );
  options.onProgress?.({
    type: "plan",
    segments: plan.map(({ mode, fromBlock: f, toBlock: t }) => ({
      mode,
      fromBlock: f,
      toBlock: t,
    })),
  });

  const known = new Map<number, string>();
  const hashOf = async (block: number) =>
    known.get(block) ?? ((await getBlockHashes(source, [block]))[0] as string);
  const map = await buildRuntimeMap(source, fromBlock, toBlock, { hashOf });
  const loader = new RuntimeLoader(source, options.metadataStore);
  const runtimeFor = (block: number): Promise<DecodingRuntime> =>
    hashOf(block === 0 ? 0 : block - 1).then((h) => loader.load(map.executingVersion(block), h));
  const compiled = compileSpec(spec);

  const directTotal = plan
    .filter((s) => s.mode === "direct")
    .reduce((n, s) => n + s.toBlock - s.fromBlock + 1, 0);
  const chunkTotal = plan.reduce(
    (n, s) =>
      s.mode === "snapshot"
        ? n +
          s.entry.manifest.chunks.filter(
            (c) => c.toBlock >= s.fromBlock && c.fromBlock <= s.toBlock,
          ).length
        : n,
    0,
  );
  let directDone = 0;
  let chunksDone = 0;
  const rows: IndexedRow[] = [];
  const segments: SpecSegmentReport[] = [];

  for (const segment of plan) {
    options.signal?.throwIfAborted();
    const segStart = Date.now();
    const report: SpecSegmentReport = {
      mode: segment.mode,
      fromBlock: segment.fromBlock,
      toBlock: segment.toBlock,
      chunks: 0,
      integrityProblems: [],
      rows: 0,
      ms: 0,
    };
    if (segment.mode === "snapshot" && options.manifests) {
      report.manifestDigest = segment.entry.digest;
      for (const [i, chunk] of segment.entry.manifest.chunks.entries()) {
        if (chunk.toBlock < segment.fromBlock || chunk.fromBlock > segment.toBlock) continue;
        options.signal?.throwIfAborted();
        const blob = await options.manifests.blob(chunk.blob.digest);
        const integrity = await checkChunkIntegrity(spec, chunk, blob);
        report.integrityProblems.push(...integrity.problems.map((p) => `chunk ${i}: ${p}`));
        const inRange = integrity.rows.filter(
          (r) => r.block >= segment.fromBlock && r.block <= segment.toBlock,
        );
        rows.push(...inRange);
        report.rows += inRange.length;
        report.chunks++;
        options.onProgress?.({ type: "chunk", done: ++chunksDone, total: chunkTotal });
        options.onRows?.(inRange, Math.min(chunk.toBlock, segment.toBlock));
      }
    } else if (segment.mode === "direct") {
      const step = options.stepBlocks ?? 5_000;
      for (let start = segment.fromBlock; start <= segment.toBlock; start += step) {
        options.signal?.throwIfAborted();
        const end = Math.min(start + step - 1, segment.toBlock);
        const base = directDone;
        const scan = await scanRawEvents(source, start, end, {
          concurrency: options.concurrency ?? 32,
          onProgress: (done) =>
            options.onProgress?.({ type: "blocks", done: base + done, total: directTotal }),
        });
        directDone = base + (end - start + 1);
        for (const b of scan.blocks) known.set(b.block, b.hash);
        const stepRows: IndexedRow[] = [];
        for (const { block, raw } of scan.blocks) {
          if (raw.length === 0) continue;
          stepRows.push(
            ...eventsToRows(compiled, decodeEvents(await runtimeFor(block), block, raw)),
          );
        }
        rows.push(...stepRows);
        report.rows += stepRows.length;
        options.onRows?.(stepRows, end);
      }
    }
    report.ms = Date.now() - segStart;
    segments.push(report);
  }

  return {
    spec,
    head,
    fromBlock,
    toBlock,
    rows,
    segments,
    uncovered: plan
      .filter((s) => s.mode === "uncovered")
      .map(({ fromBlock: f, toBlock: t }) => ({ fromBlock: f, toBlock: t })),
    integrityOk: segments.every((s) => s.integrityProblems.length === 0),
    ms: Date.now() - started,
    hashOf,
    runtimeFor,
  };
}

export interface ReconcileHistoryOptions {
  /** Window size for direct segments (snapshot segments use their chunk boundaries). Default: whole segment. */
  windowBlocks?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface HistoryReconciliation {
  windows: {
    fromBlock: number;
    toBlock: number;
    accounts: number;
    failed: AccountReconciliation[];
  }[];
  /** Account checks performed (an account is checked once per window it appears in). */
  checks: number;
  failed: AccountReconciliation[];
  ok: boolean;
  ms: number;
}

/**
 * L3 for a whole loaded history: every account touched in each window must reconcile against
 * source-chain state at the window edges. A no-op (ok, zero accounts) for specs without a
 * balance reconciliation model.
 */
export async function reconcileHistory(
  history: SpecHistory,
  source: RpcClient,
  options: ReconcileHistoryOptions = {},
): Promise<HistoryReconciliation> {
  const started = Date.now();
  if (history.spec.reconcile.type !== "balance-delta") {
    return { windows: [], checks: 0, failed: [], ok: true, ms: 0 };
  }
  const windows: { fromBlock: number; toBlock: number }[] = [];
  for (const s of history.segments) {
    if (s.mode === "uncovered") continue;
    const size = options.windowBlocks ?? s.toBlock - s.fromBlock + 1;
    for (let f = s.fromBlock; f <= s.toBlock; f += size) {
      windows.push({ fromBlock: f, toBlock: Math.min(f + size - 1, s.toBlock) });
    }
  }
  const result: HistoryReconciliation = { windows: [], checks: 0, failed: [], ok: true, ms: 0 };
  for (const [i, w] of windows.entries()) {
    options.signal?.throwIfAborted();
    const rows = history.rows.filter((r) => r.block >= w.fromBlock && r.block <= w.toBlock);
    const checked = await reconcileAccounts({
      client: source,
      spec: history.spec,
      rows,
      fromBlock: w.fromBlock,
      toBlock: w.toBlock,
      hashOf: history.hashOf,
      runtimeFor: history.runtimeFor,
      concurrency: options.concurrency ?? 16,
    });
    const failed = checked.filter((c) => !c.ok);
    result.windows.push({ ...w, accounts: checked.length, failed });
    result.checks += checked.length;
    result.failed.push(...failed);
    options.onProgress?.(i + 1, windows.length);
  }
  result.ok = result.failed.length === 0;
  result.ms = Date.now() - started;
  return result;
}
