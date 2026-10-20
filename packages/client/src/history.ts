import {
  AccountBloom,
  type AccountReconciliation,
  buildRuntimeMap,
  checkChunkIntegrity,
  checkRowTruth,
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

export interface HistoryOptions {
  spec: Spec;
  /** Source-chain RPC (archive), used for direct sync and every verification. */
  source: RpcClient;
  /** Where published manifests come from; omit to sync everything directly. */
  manifests?: ManifestSource;
  /** Account ids to match in the spec's account columns (lower-case hex; e.g. AccountId32 + H160). */
  accounts: readonly string[];
  /** Account reconciled against source state (L3); defaults to the first of `accounts`. */
  reconcileAccount?: string;
  fromBlock?: number;
  /** Defaults to the source chain's finalized head. */
  toBlock?: number;
  /** Gaps longer than this are reported as uncovered (default 200,000 blocks). */
  maxDirectBlocks?: number;
  /** Verify the account's rows against source events (L2). Default true. */
  rowTruth?: boolean;
  /** Reconcile the account against source state per chunk / segment (L3). Default true. */
  reconcile?: boolean;
  concurrency?: number;
  metadataStore?: MetadataStore;
  onProgress?: (event: ProgressEvent) => void;
}

export type ProgressEvent =
  | { type: "plan"; segments: Omit<SegmentReport, "rows">[] }
  | { type: "chunk"; segment: number; chunk: number; downloaded: boolean }
  | { type: "direct"; segment: number; done: number; total: number }
  | { type: "verify"; segment: number; stage: "row-truth" | "reconcile" };

export interface SegmentReport {
  mode: CoverageSegment["mode"];
  fromBlock: number;
  toBlock: number;
  manifestDigest?: string;
  publisher?: string | null;
  chunksDownloaded: number;
  chunksSkippedByBloom: number;
  integrityProblems: string[];
  rowTruthFailures: IndexedRow[];
  reconciliation: AccountReconciliation[];
  rows: number;
}

export interface HistoryResult {
  head: number;
  rows: IndexedRow[];
  segments: SegmentReport[];
  /** True when every snapshot passed L1, every checked row exists (L2) and every reconciliation holds (L3). */
  verified: boolean;
  /** Block ranges not covered by any manifest and too long to sync directly. */
  uncovered: { fromBlock: number; toBlock: number }[];
}

/**
 * Builds one account's history with no server: published snapshots where available (only chunks
 * whose bloom may contain the account are downloaded), direct sync from the source chain for short
 * gaps, and verification against the source chain — L1 for every downloaded chunk, L2 for the
 * account's rows, L3 for every chunk and direct segment (including bloom-skipped chunks, so a
 * lying bloom cannot hide history either).
 */
export async function accountHistory(options: HistoryOptions): Promise<HistoryResult> {
  const { spec, source } = options;
  const accounts = new Set(options.accounts.map((a) => a.toLowerCase()));
  const reconcileAccount = (options.reconcileAccount ?? options.accounts[0])?.toLowerCase();
  const concurrency = options.concurrency ?? 32;
  const reconcile =
    (options.reconcile ?? true) && spec.reconcile.type === "balance-delta" && !!reconcileAccount;
  const head = (await getFinalizedHead(source)).number;
  const fromBlock = Math.max(options.fromBlock ?? spec.source.fromBlock, spec.source.fromBlock);
  const toBlock = Math.min(options.toBlock ?? head, head);

  const entries = options.manifests ? await options.manifests.list(spec) : [];
  const plan = planCoverage(
    entries,
    { fromBlock, toBlock },
    {
      maxDirectBlocks: options.maxDirectBlocks ?? 200_000,
    },
  );
  const reports: SegmentReport[] = plan.map((s) => ({
    mode: s.mode,
    fromBlock: s.fromBlock,
    toBlock: s.toBlock,
    ...(s.mode === "snapshot"
      ? { manifestDigest: s.entry.digest, publisher: s.entry.publisher }
      : {}),
    chunksDownloaded: 0,
    chunksSkippedByBloom: 0,
    integrityProblems: [],
    rowTruthFailures: [],
    reconciliation: [],
    rows: 0,
  }));
  options.onProgress?.({ type: "plan", segments: reports.map(({ rows: _, ...r }) => r) });

  const known = new Map<number, string>();
  const hashOf = async (block: number) =>
    known.get(block) ?? ((await getBlockHashes(source, [block]))[0] as string);
  const covered = plan.filter((s) => s.mode !== "uncovered");
  const map =
    covered.length > 0
      ? await buildRuntimeMap(source, covered[0]?.fromBlock as number, toBlock, { hashOf })
      : undefined;
  const loader = new RuntimeLoader(source, options.metadataStore);
  const runtimeFor = async (block: number): Promise<DecodingRuntime> => {
    if (!map) throw new Error("no runtime map");
    return loader.load(map.executingVersion(block), await hashOf(block === 0 ? 0 : block - 1));
  };
  const mine = (row: IndexedRow) => spec.accounts.some((c) => accounts.has(row.cells[c] ?? ""));
  const compiled = compileSpec(spec);
  const allRows: IndexedRow[] = [];

  const verifyWindow = async (
    report: SegmentReport,
    index: number,
    rows: IndexedRow[],
    from: number,
    to: number,
  ) => {
    if (!reconcile || !reconcileAccount) return;
    options.onProgress?.({ type: "verify", segment: index, stage: "reconcile" });
    report.reconciliation.push(
      ...(await reconcileAccounts({
        client: source,
        spec,
        rows,
        fromBlock: from,
        toBlock: to,
        hashOf,
        runtimeFor,
        accounts: [reconcileAccount],
      })),
    );
  };

  for (const [index, segment] of plan.entries()) {
    const report = reports[index] as SegmentReport;
    const segmentRows: IndexedRow[] = [];
    if (segment.mode === "snapshot") {
      const manifest = segment.entry.manifest;
      for (const [chunkIndex, chunk] of manifest.chunks.entries()) {
        if (chunk.toBlock < segment.fromBlock || chunk.fromBlock > segment.toBlock) continue;
        const bloom = AccountBloom.fromBase64(chunk.bloom);
        const hit = [...accounts].some((a) => bloom.has(a));
        let chunkRows: IndexedRow[] = [];
        if (hit && options.manifests) {
          const blob = await options.manifests.blob(chunk.blob.digest);
          const integrity = await checkChunkIntegrity(spec, chunk, blob);
          report.integrityProblems.push(
            ...integrity.problems.map((p) => `chunk ${chunkIndex}: ${p}`),
          );
          chunkRows = integrity.rows.filter(mine);
          report.chunksDownloaded++;
        } else {
          report.chunksSkippedByBloom++;
        }
        options.onProgress?.({ type: "chunk", segment: index, chunk: chunkIndex, downloaded: hit });
        await verifyWindow(report, index, chunkRows, chunk.fromBlock, chunk.toBlock);
        segmentRows.push(
          ...chunkRows.filter((r) => r.block >= segment.fromBlock && r.block <= segment.toBlock),
        );
      }
    } else if (segment.mode === "direct") {
      const scan = await scanRawEvents(source, segment.fromBlock, segment.toBlock, {
        concurrency,
        onProgress: (done, total) =>
          options.onProgress?.({ type: "direct", segment: index, done, total }),
      });
      for (const b of scan.blocks) known.set(b.block, b.hash);
      for (const { block, raw } of scan.blocks) {
        if (raw.length === 0) continue;
        segmentRows.push(
          ...eventsToRows(compiled, decodeEvents(await runtimeFor(block), block, raw)).filter(mine),
        );
      }
      await verifyWindow(report, index, segmentRows, segment.fromBlock, segment.toBlock);
    }
    if (segment.mode === "snapshot" && (options.rowTruth ?? true) && segmentRows.length > 0) {
      options.onProgress?.({ type: "verify", segment: index, stage: "row-truth" });
      report.rowTruthFailures = await checkRowTruth({
        client: source,
        spec,
        rows: segmentRows,
        hashOf,
        runtimeFor,
        concurrency,
      });
    }
    report.rows = segmentRows.length;
    allRows.push(...segmentRows);
  }

  const seen = new Set<string>();
  const rows = allRows
    .filter((r) => {
      const key = `${r.block}:${r.eventIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.block - b.block || a.eventIndex - b.eventIndex);
  const verified = reports.every(
    (r) =>
      r.integrityProblems.length === 0 &&
      r.rowTruthFailures.length === 0 &&
      r.reconciliation.every((x) => x.ok),
  );
  return {
    head,
    rows,
    segments: reports,
    verified,
    uncovered: plan
      .filter((s) => s.mode === "uncovered")
      .map(({ fromBlock: f, toBlock: t }) => ({ fromBlock: f, toBlock: t })),
  };
}

/** H160 that pallet-revive maps an AccountId32 to, via the `ReviveApi_address` runtime API. */
export async function reviveAddressOf(portaldot: RpcClient, accountId32: string): Promise<string> {
  const result = await portaldot.send<string>("state_call", ["ReviveApi_address", accountId32]);
  if (!/^0x[0-9a-fA-F]{40}$/.test(result))
    throw new Error(`unexpected ReviveApi_address result ${result}`);
  return result.toLowerCase();
}

/** AccountId32 that pallet-revive maps an H160 to, via the `ReviveApi_account_id` runtime API. */
export async function reviveAccountIdOf(portaldot: RpcClient, h160: string): Promise<string> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(h160))
    throw new Error("reviveAccountIdOf: expected a 20-byte H160");
  const result = await portaldot.send<string>("state_call", ["ReviveApi_account_id", h160]);
  if (!/^0x[0-9a-fA-F]{64}$/.test(result)) {
    throw new Error(`unexpected ReviveApi_account_id result ${result}`);
  }
  return result.toLowerCase();
}
