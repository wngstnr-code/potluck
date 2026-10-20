import {
  compileSpec,
  decodeEvents,
  eventsToRows,
  getFinalizedHead,
  getRuntimeVersion,
  type IndexedRow,
  type MetadataStore,
  type RpcClient,
  RuntimeLoader,
  scanRawEvents,
} from "@potluck/core";
import type { Spec } from "@potluck/spec";

export interface FollowOptions {
  spec: Spec;
  source: RpcClient;
  /** Account ids to match (lower-case hex); empty = every row of the spec. */
  accounts: readonly string[];
  /** Last block already processed; following starts at the next one. */
  afterBlock: number;
  /** Polling interval (default 6 s, Portaldot's block time). */
  intervalMs?: number;
  metadataStore?: MetadataStore;
  onRows: (rows: IndexedRow[], upToBlock: number) => void;
  onError?: (error: unknown) => void;
}

/**
 * Follows finalized blocks and reports the spec's new rows for the given accounts. Polls the
 * finalized head instead of subscribing: the public Portaldot endpoint drops connections every
 * ~60 s, which silently ends subscriptions, while polled calls are retried across reconnects.
 * Each block is decoded with the runtime that executed it, so runtime upgrades are handled.
 * Returns a stop function.
 */
export function followHistory(options: FollowOptions): () => void {
  const accounts = new Set(options.accounts.map((a) => a.toLowerCase()));
  const compiled = compileSpec(options.spec);
  const loader = new RuntimeLoader(options.source, options.metadataStore);
  let cursor = options.afterBlock;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    try {
      const head = (await getFinalizedHead(options.source)).number;
      if (head > cursor) {
        const scan = await scanRawEvents(options.source, cursor, head, { strategy: "per-block" });
        const hashes = new Map(scan.blocks.map((b) => [b.block, b.hash]));
        const rows: IndexedRow[] = [];
        for (const { block, raw } of scan.blocks) {
          if (block === cursor || raw.length === 0) continue; // `cursor` itself is only the parent
          const parentHash = hashes.get(block - 1) as string;
          const version = (await getRuntimeVersion(options.source, parentHash)).specVersion;
          const runtime = await loader.load(version, parentHash);
          for (const row of eventsToRows(compiled, decodeEvents(runtime, block, raw))) {
            if (
              accounts.size === 0 ||
              options.spec.accounts.some((c) => accounts.has(row.cells[c] ?? ""))
            ) {
              rows.push(row);
            }
          }
        }
        cursor = head;
        if (!stopped) options.onRows(rows, head);
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      if (!stopped) timer = setTimeout(tick, options.intervalMs ?? 6_000);
    }
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
