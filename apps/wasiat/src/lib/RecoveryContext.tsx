import { connectWs, mapPool, type RpcClient, withRetry } from "@potluck/core";
import { IndexedDbMetadataStore } from "@potluck/ui/metadataStore";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { KUSAMA_AH } from "../config";
import {
  type InheritorRecord,
  type OpenAttempt,
  type Plan,
  RecoveryChain,
  type ReplayResult,
  replay,
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
}

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
 */
export function RecoveryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RecoveryState>({
    phase: "connecting",
    error: null,
    chain: null,
    client: null,
    head: null,
    constants: null,
    accounts: [],
    replays: new Map(),
    replayProgress: null,
    replayMs: null,
  });

  useEffect(() => {
    let cancelled = false;
    let client: RpcClient | undefined;
    const patch = (p: Partial<RecoveryState>) => {
      if (!cancelled) setState((s) => ({ ...s, ...p }));
    };
    (async () => {
      client = withRetry(await connectWs(KUSAMA_AH.ws));
      const chain = await RecoveryChain.open(
        client,
        new IndexedDbMetadataStore("kusama-asset-hub"),
      );
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
        const replayed = replay(timeline);
        const entry = { timeline, replayed, matches: replayMatches(a, replayed) };
        done++;
        if (!cancelled) {
          setState((s) => {
            const replays = new Map(s.replays);
            replays.set(a.account, entry);
            return { ...s, replays, replayProgress: { done, total: accounts.length } };
          });
        }
      });
      patch({ phase: "ready", replayProgress: null, replayMs: Date.now() - started });
    })().catch((e: unknown) =>
      patch({ phase: "error", error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
      void client?.close();
    };
  }, []);

  return <RecoveryContext.Provider value={state}>{children}</RecoveryContext.Provider>;
}

export function useRecovery(): RecoveryState {
  const state = useContext(RecoveryContext);
  if (!state) throw new Error("useRecovery outside RecoveryProvider");
  return state;
}
