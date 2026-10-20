import { u8aToHex } from "@polkadot/util";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { reviveAccountIdOf, reviveAddressOf } from "@potluck/client";
import {
  type AccountReconciliation,
  checkRowTruth,
  type IndexedRow,
  reconcileAccounts,
} from "@potluck/core";
import type { HistoryState } from "./useHistory";

/** Portaldot SS58 prefix (CLAUDE.md §7). */
const SS58_PREFIX = 42;

export interface AccountIds {
  id32: string;
  h160: string;
  ss58: string;
}

/** Accepts SS58, a 32-byte AccountId or a 20-byte H160; returns lower-case hex of the given form. */
export function parseAccountInput(input: string): { id32?: string; h160?: string } | null {
  const v = input.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return { id32: v.toLowerCase() };
  if (/^0x[0-9a-fA-F]{40}$/.test(v)) return { h160: v.toLowerCase() };
  try {
    return { id32: u8aToHex(decodeAddress(v)).toLowerCase() };
  } catch {
    return null;
  }
}

export const toSs58 = (id32: string) => encodeAddress(id32, SS58_PREFIX);

export interface AccountReport {
  ids: AccountIds;
  rows: IndexedRow[];
  /** L2: rows re-derived from source events; `failed` are rows the chain does not contain. */
  rowTruth: { checked: number; blocks: number; failed: IndexedRow[]; ms: number };
  /** L3 over the whole loaded range; null when the account is opaque (BalanceSet) or has no native rows. */
  balance: AccountReconciliation | null;
  balanceMs: number;
  range: { fromBlock: number; toBlock: number };
}

/**
 * Verifies one account against the source chain using the already-loaded history: both address
 * forms are resolved through the runtime (never computed locally), every row of the account is
 * re-derived from its block (L2), and its balance is reconciled over the whole range (L3).
 */
export async function verifyAccount(state: HistoryState, input: string): Promise<AccountReport> {
  const { client, history } = state;
  if (!client || !history || state.verifiedTo == null) throw new Error("history is still loading");
  const parsed = parseAccountInput(input);
  if (!parsed) throw new Error("Not an address: use SS58, a 32-byte AccountId or a 0x H160");
  const id32 = parsed.id32 ?? (await reviveAccountIdOf(client, parsed.h160 as string));
  const h160 = parsed.h160 ?? (await reviveAddressOf(client, id32));
  const ids = { id32, h160, ss58: toSs58(id32) };

  const toBlock = state.verifiedTo;
  const rows = state.rows.filter(
    (r) =>
      r.block <= toBlock &&
      [r.cells.from, r.cells.to].some((a) => a === ids.id32 || a === ids.h160),
  );

  const t2 = Date.now();
  const failed = await checkRowTruth({
    client,
    spec: history.spec,
    rows,
    hashOf: history.hashOf,
    runtimeFor: history.runtimeFor,
    concurrency: 16,
  });
  const rowTruth = {
    checked: rows.length,
    blocks: new Set(rows.map((r) => r.block)).size,
    failed,
    ms: Date.now() - t2,
  };

  const t3 = Date.now();
  const [balance] = await reconcileAccounts({
    client,
    spec: history.spec,
    rows,
    fromBlock: history.fromBlock,
    toBlock,
    hashOf: history.hashOf,
    runtimeFor: history.runtimeFor,
    accounts: [ids.id32],
  });
  return {
    ids,
    rows,
    rowTruth,
    balance: balance ?? null,
    balanceMs: Date.now() - t3,
    range: { fromBlock: history.fromBlock, toBlock },
  };
}

/** Accounts ranked by number of rows, with their last activity. */
export function activeAccounts(rows: readonly IndexedRow[], limit = 200) {
  const stats = new Map<string, { rows: number; lastBlock: number; native: number }>();
  for (const r of rows) {
    for (const a of new Set([r.cells.from, r.cells.to])) {
      if (!a) continue;
      const s = stats.get(a) ?? { rows: 0, lastBlock: 0, native: 0 };
      s.rows++;
      s.lastBlock = Math.max(s.lastBlock, r.block);
      if (r.cells.asset === "native") s.native++;
      stats.set(a, s);
    }
  }
  return [...stats.entries()]
    .sort((a, b) => b[1].rows - a[1].rows || b[1].lastBlock - a[1].lastBlock)
    .slice(0, limit)
    .map(([account, s]) => ({ account, ...s }));
}
