import { u8aToHex } from "@polkadot/util";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import type { SpecHistory } from "@potluck/client";
import {
  type AccountReconciliation,
  checkRowTruth,
  type IndexedRow,
  type RpcClient,
  reconcileAccounts,
  scanRawEvents,
} from "@potluck/core";
import { POLKADOT_AH } from "../config";

/** L2 re-fetches every block an account appears in; above this many rows only L3 runs. */
export const ROW_TRUTH_LIMIT = 150;

export const ahSs58 = (id32: string) => encodeAddress(id32, POLKADOT_AH.ss58);

/** Short SS58: both ends, so pallet accounts sharing a long prefix stay distinguishable. */
export const shortAhSs58 = (id32: string) => {
  const s = ahSs58(id32);
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
};

/** Accepts any SS58 or a 32-byte AccountId; returns lower-case AccountId32 hex. */
export function parseAhAccount(input: string): string | null {
  const v = input.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v.toLowerCase();
  try {
    return u8aToHex(decodeAddress(v)).toLowerCase();
  } catch {
    return null;
  }
}

export interface AhAccountReport {
  account: string;
  rows: IndexedRow[];
  /** L2, or null when the account has more than ROW_TRUTH_LIMIT rows. */
  rowTruth: { checked: number; blocks: number; failed: IndexedRow[]; ms: number } | null;
  balance: AccountReconciliation | null;
  balanceMs: number;
}

/**
 * Checks one account of the loaded window against Polkadot Asset Hub: its rows are re-derived from
 * their blocks (L2, up to ROW_TRUTH_LIMIT rows) and its balance at both window edges must differ
 * by exactly the sum of its rows (L3), so a hidden row cannot pass.
 */
export async function checkAhAccount(
  history: SpecHistory,
  source: RpcClient,
  account: string,
): Promise<AhAccountReport> {
  const rows = history.rows.filter((r) => r.cells.from === account || r.cells.to === account);
  let rowTruth: AhAccountReport["rowTruth"] = null;
  if (rows.length <= ROW_TRUTH_LIMIT) {
    const t = Date.now();
    const failed = await checkRowTruth({
      client: source,
      spec: history.spec,
      rows,
      hashOf: history.hashOf,
      runtimeFor: history.runtimeFor,
      concurrency: 16,
    });
    rowTruth = {
      checked: rows.length,
      blocks: new Set(rows.map((r) => r.block)).size,
      failed,
      ms: Date.now() - t,
    };
  }
  const t = Date.now();
  const [balance] = await reconcileAccounts({
    client: source,
    spec: history.spec,
    rows,
    fromBlock: history.fromBlock,
    toBlock: history.toBlock,
    hashOf: history.hashOf,
    runtimeFor: history.runtimeFor,
    accounts: [account],
  });
  return { account, rows, rowTruth, balance: balance ?? null, balanceMs: Date.now() - t };
}

/**
 * Measures direct sync in this browser: fetches the events of the window's last `blocks` blocks
 * from Polkadot Asset Hub and returns the rate. Decoding is not included, so the estimate it gives
 * for the whole window is a lower bound.
 */
export async function measureDirectSync(
  source: RpcClient,
  toBlock: number,
  blocks = 300,
): Promise<{ blocks: number; ms: number; perSecond: number }> {
  const t = Date.now();
  await scanRawEvents(source, toBlock - blocks + 1, toBlock, { concurrency: 32 });
  const ms = Date.now() - t;
  return { blocks, ms, perSecond: blocks / (ms / 1000) };
}
