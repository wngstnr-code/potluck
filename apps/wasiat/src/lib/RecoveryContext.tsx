import { createPotluck } from "@potluck/client";
import { connectWs, mapPool, type RpcClient, withRetry } from "@potluck/core";
import { IndexedDbBlobCache } from "@potluck/ui/blobCache";
import { IndexedDbMetadataStore } from "@potluck/ui/metadataStore";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { KUSAMA_AH, RECOVERY_SPEC } from "../config";
import {
  type InheritorRecord,
  mergeTimelines,
  type OpenAttempt,
  type Plan,
  RecoveryChain,
  type ReplayResult,
  replay,
  rowToEvent,
  type TimelineEvent,
} from "./recovery";

/** One account with any Recovery state: a plan, an open attempt or an inheritor. */
export interface AccountState {
  account: string;
  plan: Plan | null;
  attempts: OpenAttempt[];
  inheritor: InheritorRecord | null;
}

export interface AccountReplay {
  timeline: TimelineEvent[];
  replayed: ReplayResult;
  /** The replayed events imply exactly the current storage (inheritor, open attempts, plan). */
  matches: boolean;
}

/** The Recovery event history published on Portaldot, loaded and checked through the Potluck SDK. */
export interface SnapshotState {
  phase: "loading" | "ready" | "error";
  error: string | null;
  /** Every row of the spec as timeline entries (all accounts). */
  events: TimelineEvent[];
  /** Highest block covered by a published snapshot. */
  snapshotTo: number | null;
  /** Blocks synced directly from Kusama AH after the snapshot. */
  directBlocks: number;
  /** Ranges neither published nor short enough to sync in the browser. */
  uncovered: { fromBlock: number; toBlock: number }[];
  /** Every snapshot chunk passed L1 (hashes to its manifest, which hashes to the registry). */
  integrityOk: boolean;
  ms: number | null;
}

export interface RecoveryState {
  phase: "connecting" | "loading" | "replaying" | "ready" | "error";
  error: string | null;
  chain: RecoveryChain | null;
  client: RpcClient | null;
  head: number | null;
  constants: { securityDeposit: bigint; maxFriends: number } | null;
  accounts: AccountState[];
  replays: Map<string, AccountReplay>;
  replayProgress: { done: number; total: number } | null;
  replayMs: number | null;
  snapshot: SnapshotState;
}

/** Longest tail after the published snapshot that the browser syncs directly (≈ 20 s). */
const MAX_DIRECT_BLOCKS = 2_000;

const RecoveryContext = createContext<RecoveryState | null>(null);

export function replayMatches(state: AccountState, replayed: ReplayResult): boolean {
  const open = state.attempts.map((a) => a.groupIndex).sort((a, b) => a - b);
  return (
    replayed.inheritor === (state.inheritor?.inheritor ?? null) &&
    JSON.stringify(replayed.openAttempts) === JSON.stringify(open) &&
    replayed.configured === (state.plan !== null)
  );
}

/**
 * Reads every Recovery account of Kusama Asset Hub at the finalized head, then rebuilds and
 * replays each account's timeline in the background and compares it with current storage.
 * In parallel it loads the Recovery event history published on Portaldot with the Potluck SDK;
 * its rows join each timeline, so events that changed no storage are part of the replay too.
 */
export function RecoveryProvider({ children }: { children: ReactNode }) {
  const [timelines, setTimelines] = useState<Map<string, TimelineEvent[]>>(new Map());
  const [state, setState] = useState<Omit<RecoveryState, "replays">>({
    phase: "connecting",
    error: null,
    chain: null,
    client: null,
    head: null,
    constants: null,
    accounts: [],
    replayProgress: null,
    replayMs: null,
    snapshot: {
      phase: "loading",
      error: null,
      events: [],
      snapshotTo: null,
      directBlocks: 0,
      uncovered: [],
      integrityOk: true,
      ms: null,
    },
  });

  useEffect(() => {
    let cancelled = false;
    let client: RpcClient | undefined;
    let closePotluck: (() => Promise<void>) | undefined;
    const patch = (p: Partial<Omit<RecoveryState, "replays" | "snapshot">>) => {
      if (!cancelled) setState((s) => ({ ...s, ...p }));
    };
    const patchSnapshot = (p: Partial<SnapshotState>) => {
      if (!cancelled) setState((s) => ({ ...s, snapshot: { ...s.snapshot, ...p } }));
    };
    const metadataStore = new IndexedDbMetadataStore("kusama-asset-hub");
    let resolveChain: (chain: RecoveryChain) => void = () => {};
    const chainReady = new Promise<RecoveryChain>((resolve) => {
      resolveChain = resolve;
    });

    (async () => {
      const started = Date.now();
      const potluck = await createPotluck({ metadataStore, blobCache: new IndexedDbBlobCache() });
      closePotluck = () => potluck.close();
      const history = await potluck.specHistory({
        spec: RECOVERY_SPEC,
        maxDirectBlocks: MAX_DIRECT_BLOCKS,
      });
      const chain = await chainReady;
      const times = new Map<number, number>();
      await mapPool([...new Set(history.rows.map((r) => r.block))], 8, async (block) => {
        times.set(block, await chain.timeAt(block));
      });
      const snapshots = history.segments.filter((s) => s.mode === "snapshot");
      patchSnapshot({
        phase: "ready",
        events: history.rows.map((row) => rowToEvent(row, times.get(row.block) ?? 0)),
        snapshotTo: snapshots.length ? Math.max(...snapshots.map((s) => s.toBlock)) : null,
        directBlocks: history.segments
          .filter((s) => s.mode === "direct")
          .reduce((n, s) => n + s.toBlock - s.fromBlock + 1, 0),
        uncovered: history.uncovered,
        integrityOk: history.integrityOk,
        ms: Date.now() - started,
      });
    })().catch((e: unknown) =>
      patchSnapshot({ phase: "error", error: e instanceof Error ? e.message : String(e) }),
    );

    (async () => {
      client = withRetry(await connectWs(KUSAMA_AH.ws));
      const chain = await RecoveryChain.open(client, metadataStore);
      resolveChain(chain);
      patch({
        phase: "loading",
        chain,
        client,
        head: chain.head.number,
        constants: chain.constants(),
      });
      const [plans, attempts, inheritors] = await Promise.all([
        chain.plans(),
        chain.attempts(),
        chain.inheritors(),
      ]);
      const ids = [
        ...new Set([
          ...plans.map((p) => p.account),
          ...attempts.map((a) => a.lost),
          ...inheritors.map((i) => i.lost),
        ]),
      ];
      const accounts: AccountState[] = ids.map((account) => ({
        account,
        plan: plans.find((p) => p.account === account) ?? null,
        attempts: attempts.filter((a) => a.lost === account),
        inheritor: inheritors.find((i) => i.lost === account) ?? null,
      }));
      patch({ phase: "replaying", accounts, replayProgress: { done: 0, total: accounts.length } });

      const started = Date.now();
      let done = 0;
      await mapPool(accounts, 8, async (a) => {
        const timeline = await chain.accountTimeline(a.account, a.attempts);
        done++;
        if (!cancelled) {
          setTimelines((t) => new Map(t).set(a.account, timeline));
          patch({ replayProgress: { done, total: accounts.length } });
        }
      });
      patch({ phase: "ready", replayProgress: null, replayMs: Date.now() - started });
    })().catch((e: unknown) =>
      patch({ phase: "error", error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
      void client?.close();
      void closePotluck?.();
    };
  }, []);

  // Each timeline is replayed once both sources are in (storage search and, when it loaded, the
  // snapshot); until the snapshot is ready the storage timeline is replayed alone.
  const replays = useMemo(() => {
    const byAccount = new Map<string, TimelineEvent[]>();
    for (const e of state.snapshot.events) {
      const account = e.fields.lost;
      if (account) byAccount.set(account, [...(byAccount.get(account) ?? []), e]);
    }
    const out = new Map<string, AccountReplay>();
    for (const a of state.accounts) {
      const fromStorage = timelines.get(a.account);
      if (!fromStorage) continue;
      const timeline = mergeTimelines(fromStorage, byAccount.get(a.account) ?? []);
      const replayed = replay(timeline);
      out.set(a.account, { timeline, replayed, matches: replayMatches(a, replayed) });
    }
    return out;
  }, [state.accounts, state.snapshot.events, timelines]);

  return (
    <RecoveryContext.Provider value={{ ...state, replays }}>{children}</RecoveryContext.Provider>
  );
}

export function useRecovery(): RecoveryState {
  const state = useContext(RecoveryContext);
  if (!state) throw new Error("useRecovery outside RecoveryProvider");
  return state;
}
