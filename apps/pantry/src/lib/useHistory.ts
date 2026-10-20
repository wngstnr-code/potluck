import {
  followHistory,
  type HistoryReconciliation,
  type ManifestSource,
  PortaldotSource,
  reconcileHistory,
  type SpecHistory,
  specHistory,
} from "@potluck/client";
import { connectWs, type IndexedRow, type RpcClient, withRetry } from "@potluck/core";
import type { Spec } from "@potluck/spec";
import { IndexedDbMetadataStore } from "@potluck/ui/metadataStore";
import { useEffect, useState } from "react";
import { PORTALDOT } from "../config";

export type Phase = "connecting" | "loading" | "verifying" | "live" | "error";

export interface HistoryState {
  phase: Phase;
  error: string | null;
  /** Finalized head of the source chain (advances while live). */
  head: number | null;
  fromBlock: number;
  /** Last block covered by the loaded and verified history. */
  verifiedTo: number | null;
  rows: IndexedRow[];
  /** Rows that arrived through the live tail after verification. */
  tailRows: number;
  progress: { done: number; total: number; unit: "blocks" | "chunks" } | null;
  /** How the history was obtained, and how long it took. */
  source: { mode: "direct" | "snapshot" | "mixed"; ms: number; chunks: number } | null;
  integrityOk: boolean | null;
  reconciliation: HistoryReconciliation | null;
  reconcileProgress: { done: number; total: number } | null;
  startedAt: number;
  /** Connection to the source chain, shared by every page (null until connected). */
  client: RpcClient | null;
  /** The loaded history with its runtime/hash helpers, for per-account checks (null until loaded). */
  history: SpecHistory | null;
}

const initial = (fromBlock: number): HistoryState => ({
  phase: "connecting",
  error: null,
  head: null,
  fromBlock,
  verifiedTo: null,
  rows: [],
  tailRows: 0,
  progress: null,
  source: null,
  integrityOk: null,
  reconciliation: null,
  reconcileProgress: null,
  startedAt: Date.now(),
  client: null,
  history: null,
});

/**
 * Loads a spec's full history from Portaldot in the browser (snapshots when published, direct
 * sync otherwise), reconciles it against chain state (L3), then follows new finalized blocks.
 */
export function useHistory(spec: Spec): HistoryState {
  const [state, setState] = useState<HistoryState>(() => initial(spec.source.fromBlock));
  useEffect(() => {
    const abort = new AbortController();
    let stopTail: (() => void) | undefined;
    let client: RpcClient | undefined;
    const patch = (p: Partial<HistoryState>) => setState((s) => ({ ...s, ...p }));

    (async () => {
      client = withRetry(await connectWs(PORTALDOT.ws));
      const metadataStore = new IndexedDbMetadataStore(spec.source.genesisHash);
      const manifests: ManifestSource | undefined = PORTALDOT.registry
        ? new PortaldotSource({
            portaldot: client,
            evmRpcUrl: PORTALDOT.evmRpc,
            registry: PORTALDOT.registry,
          })
        : undefined;
      patch({ phase: "loading", startedAt: Date.now(), client });

      const history: SpecHistory = await specHistory({
        spec,
        source: client,
        manifests,
        metadataStore,
        signal: abort.signal,
        onProgress: (e) => {
          if (e.type === "blocks")
            patch({ progress: { done: e.done, total: e.total, unit: "blocks" } });
          if (e.type === "chunk")
            patch({ progress: { done: e.done, total: e.total, unit: "chunks" } });
        },
        onRows: (rows) => {
          if (rows.length > 0) setState((s) => ({ ...s, rows: [...s.rows, ...rows] }));
        },
      });
      const modes = new Set(history.segments.map((s) => s.mode).filter((m) => m !== "uncovered"));
      patch({
        phase: "verifying",
        head: history.head,
        verifiedTo: history.toBlock,
        rows: history.rows,
        history,
        progress: null,
        integrityOk: history.integrityOk,
        source: {
          mode: modes.size > 1 ? "mixed" : modes.has("snapshot") ? "snapshot" : "direct",
          ms: history.ms,
          chunks: history.segments.reduce((n, s) => n + s.chunks, 0),
        },
      });

      const reconciliation = await reconcileHistory(history, client, {
        signal: abort.signal,
        onProgress: (done, total) => patch({ reconcileProgress: { done, total } }),
      });
      patch({
        phase: "live",
        reconciliation,
        reconcileProgress: null,
      });

      stopTail = followHistory({
        spec,
        source: client,
        accounts: [],
        afterBlock: history.toBlock,
        metadataStore,
        onRows: (rows, upTo) =>
          setState((s) => ({
            ...s,
            head: upTo,
            rows: rows.length ? [...s.rows, ...rows] : s.rows,
            tailRows: s.tailRows + rows.length,
          })),
      });
    })().catch((error: unknown) => {
      if (abort.signal.aborted) return;
      patch({ phase: "error", error: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      abort.abort();
      stopTail?.();
      void client?.close();
    };
  }, [spec]);

  return state;
}
