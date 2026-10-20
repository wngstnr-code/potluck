import type { IndexedRow } from "@potluck/core";

export interface KindStat {
  kind: string;
  evm: boolean;
  count: number;
  /** 1-based series index into --series-N / --on-series-N. */
  series: number;
}

/**
 * Fixed series per kind (by family), so a kind keeps its color while rows stream in and across
 * pages. Series 8 (green) is never used: green means "credit" in amounts.
 */
const KIND_SERIES: Record<string, number> = {
  Transfer: 1,
  TransferOnHold: 1,
  TransferAndHold: 1,
  ReserveRepatriated: 1,
  Deposit: 2,
  Withdraw: 3,
  Burned: 4,
  BurnedHeld: 4,
  Slashed: 4,
  Minted: 5,
  Restored: 5,
  Erc20Transfer: 6,
  Erc721Transfer: 7,
};

export const seriesOf = (kind: string) => KIND_SERIES[kind] ?? 9;

/** Row kinds by frequency, each with its fixed series color (shared by tags and charts). */
export function kindStats(rows: readonly IndexedRow[]): KindStat[] {
  const counts = new Map<string, { count: number; evm: boolean }>();
  for (const row of rows) {
    const kind = row.cells.kind ?? "?";
    const entry = counts.get(kind) ?? { count: 0, evm: row.cells.asset !== "native" };
    entry.count++;
    counts.set(kind, entry);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([kind, { count, evm }]) => ({ kind, evm, count, series: seriesOf(kind) }));
}

export interface ActivityBucket {
  fromBlock: number;
  native: number;
  token: number;
}

export function activity(
  rows: readonly IndexedRow[],
  fromBlock: number,
  toBlock: number,
  buckets = 24,
): { size: number; buckets: ActivityBucket[] } {
  const size = Math.max(1, Math.ceil((toBlock - fromBlock + 1) / buckets));
  const out = Array.from({ length: buckets }, (_, i) => ({
    fromBlock: fromBlock + i * size,
    native: 0,
    token: 0,
  }));
  for (const row of rows) {
    const b = out[Math.min(buckets - 1, Math.floor((row.block - fromBlock) / size))];
    if (!b) continue;
    if (row.cells.asset === "native") b.native++;
    else b.token++;
  }
  return { size, buckets: out };
}

export function accountsOf(rows: readonly IndexedRow[]): number {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.cells.from) set.add(row.cells.from);
    if (row.cells.to) set.add(row.cells.to);
  }
  return set.size;
}
