import {
  type ManifestEntry,
  PortaldotSource,
  type SpecHistory,
  specHistory,
} from "@potluck/client";
import { connectWs, type IndexedRow, type RpcClient, withRetry } from "@potluck/core";
import { IndexedDbMetadataStore } from "@potluck/ui/metadataStore";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AH_SPEC, POLKADOT_AH, PORTALDOT } from "../config";
import { BLOB_CACHE } from "./blobCache";
import { useSharedHistory } from "./HistoryContext";

export interface SnapshotState {
  phase: "idle" | "connecting" | "loading" | "ready" | "error";
  error: string | null;
  /** The newest manifest published for the spec, whose window is loaded. */
  entry: ManifestEntry | null;
  rows: IndexedRow[];
  /** The loaded window with its runtime/hash helpers, for per-account checks. */
  history: SpecHistory | null;
  /** Connection to Polkadot Asset Hub (the source chain every check runs against). */
  source: RpcClient | null;
  /** Blob bytes loaded (over bitswap or from this browser's cache), and how many chunks. */
  bytes: number;
  /** Blobs read back from this browser's cache instead of bitswap (hash-checked again). */
  fromCache: number;
  chunks: { done: number; total: number } | null;
  startedAt: number;
  /** Time from the first registry read to every chunk checked (L1). */
  ms: number | null;
}

const idle: SnapshotState = {
  phase: "idle",
  error: null,
  entry: null,
  rows: [],
  history: null,
  source: null,
  bytes: 0,
  fromCache: 0,
  chunks: null,
  startedAt: 0,
  ms: null,
};

const SnapshotContext = createContext<{ state: SnapshotState; start: () => void } | null>(null);

/**
 * Loads the newest published Polkadot Asset Hub window from Portaldot on first use (the page that
 * needs it calls `start`), then keeps it for the session: chunks come from the registry and
 * bitswap, every chunk passes L1, and the Asset Hub connection stays open for L2 / L3 checks.
 */
export function SnapshotProvider({ children }: { children: ReactNode }) {
  const portaldot = useSharedHistory().client;
  const [state, setState] = useState<SnapshotState>(idle);
  const [wanted, setWanted] = useState(false);
  const started = useRef(false);
  const start = useCallback(() => setWanted(true), []);

  useEffect(() => {
    if (!wanted || !portaldot || started.current || PORTALDOT.registries.length === 0) return;
    started.current = true;
    const patch = (p: Partial<SnapshotState>) => setState((s) => ({ ...s, ...p }));
    (async () => {
      patch({ phase: "connecting", startedAt: Date.now() });
      const source = withRetry(await connectWs(POLKADOT_AH.ws));
      const registrySource = new PortaldotSource({
        portaldot,
        evmRpcUrl: PORTALDOT.evmRpc,
        registries: PORTALDOT.registries,
        cache: BLOB_CACHE,
      });
      let bytes = 0;
      const manifests = {
        list: registrySource.list.bind(registrySource),
        blob: async (digest: string) => {
          const blob = await registrySource.blob(digest);
          bytes += blob.length;
          patch({ bytes, fromCache: registrySource.stats.cached });
          return blob;
        },
      };
      const t0 = Date.now();
      const entries = await manifests.list(AH_SPEC);
      const entry = entries.reduce<ManifestEntry | null>(
        (best, e) => (!best || e.manifest.range.toBlock > best.manifest.range.toBlock ? e : best),
        null,
      );
      if (!entry)
        throw new Error("No Polkadot Asset Hub manifest is published in the registry yet.");
      patch({ phase: "loading", entry, source });
      const history = await specHistory({
        spec: AH_SPEC,
        source,
        manifests: { list: async () => [entry], blob: manifests.blob },
        fromBlock: entry.manifest.range.fromBlock,
        toBlock: entry.manifest.range.toBlock,
        metadataStore: new IndexedDbMetadataStore(AH_SPEC.source.genesisHash),
        onProgress: (e) => {
          if (e.type === "chunk") patch({ chunks: { done: e.done, total: e.total } });
        },
      });
      patch({ phase: "ready", history, rows: history.rows, ms: Date.now() - t0 });
    })().catch((error: unknown) =>
      patch({ phase: "error", error: error instanceof Error ? error.message : String(error) }),
    );
  }, [wanted, portaldot]);

  return <SnapshotContext.Provider value={{ state, start }}>{children}</SnapshotContext.Provider>;
}

export function useSnapshot(): { state: SnapshotState; start: () => void } {
  const value = useContext(SnapshotContext);
  if (!value) throw new Error("useSnapshot outside SnapshotProvider");
  return value;
}
