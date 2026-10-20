import { blake2AsHex } from "@polkadot/util-crypto";
import {
  type AccountReconciliation,
  buildChunk,
  checkChunkIntegrity,
  checkRowTruth,
  FLAG_REASON,
  type IndexedRow,
  manifestChunk,
  reconcileAccounts,
} from "@potluck/core";
import type { HistoryState } from "./useHistory";

const DEBIT_KINDS = new Set(["Transfer", "Withdraw"]);

/** The newest plain debit of `account` (a payment or fee it made), if any. */
export function hideableDebit(
  rows: readonly IndexedRow[],
  account: string,
): IndexedRow | undefined {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i] as IndexedRow;
    if (
      r.cells.from === account &&
      r.cells.asset === "native" &&
      r.effect === "delta" &&
      DEBIT_KINDS.has(r.cells.kind ?? "") &&
      BigInt(r.cells.amount ?? "0") > 0n
    ) {
      return r;
    }
  }
  return undefined;
}

export type AttackStep = "forge" | "l1" | "l2" | "l3" | "flag";

export interface AttackResult {
  victim: string;
  hidden: IndexedRow;
  range: { fromBlock: number; toBlock: number };
  honest: { digest: string; rawHash: string; rows: number };
  forged: { digest: string; rawHash: string; rows: number };
  /** L1 problems found in the forged chunk (expected: none — the forgery is self-consistent). */
  integrityProblems: string[];
  /** L2 on the victim's remaining rows (expected: all exist on chain — deletion is invisible to L2). */
  rowTruth: { checked: number; failed: number };
  /** L3 over every touched account of the forged history. */
  reconciliation: { checks: number; failed: AccountReconciliation[] };
  victimCheck: AccountReconciliation | undefined;
  /** What a flag transaction would carry: reason and a digest of the evidence. */
  flag: { reason: number; reasonName: string; evidence: string; evidenceJson: string };
  ms: Record<AttackStep, number>;
}

/**
 * Plays a dishonest publisher against the loaded history: one debit of `victim` is removed and the
 * chunk is rebuilt so every hash, the bloom and the digest are self-consistent. Then the checks a
 * client runs are applied to the forgery, step by step.
 */
export async function runAttack(
  state: HistoryState,
  victim: string,
  onStep: (step: AttackStep) => void,
): Promise<AttackResult> {
  const { client, history } = state;
  if (!client || !history || state.verifiedTo == null) throw new Error("history is still loading");
  const range = { fromBlock: history.fromBlock, toBlock: state.verifiedTo };
  const rows = state.rows.filter((r) => r.block <= range.toBlock);
  const hidden = hideableDebit(rows, victim);
  if (!hidden) throw new Error("this account has no plain debit to hide");
  const ms = { forge: 0, l1: 0, l2: 0, l3: 0, flag: 0 };

  onStep("forge");
  let t = Date.now();
  const forgedRows = rows.filter((r) => r !== hidden);
  const [honestChunk, forgedChunk] = await Promise.all([
    buildChunk(history.spec, { ...range, rows }),
    buildChunk(history.spec, { ...range, rows: forgedRows }),
  ]);
  const honest = manifestChunk(honestChunk);
  const forged = manifestChunk(forgedChunk);
  ms.forge = Date.now() - t;

  onStep("l1");
  t = Date.now();
  const integrity = await checkChunkIntegrity(history.spec, forged, forgedChunk.blob);
  ms.l1 = Date.now() - t;

  onStep("l2");
  t = Date.now();
  const victimRows = integrity.rows.filter((r) => r.cells.from === victim || r.cells.to === victim);
  const failedRows = await checkRowTruth({
    client,
    spec: history.spec,
    rows: victimRows,
    hashOf: history.hashOf,
    runtimeFor: history.runtimeFor,
    concurrency: 16,
  });
  ms.l2 = Date.now() - t;

  onStep("l3");
  t = Date.now();
  const checks = await reconcileAccounts({
    client,
    spec: history.spec,
    rows: integrity.rows,
    ...range,
    hashOf: history.hashOf,
    runtimeFor: history.runtimeFor,
    concurrency: 16,
  });
  ms.l3 = Date.now() - t;

  onStep("flag");
  t = Date.now();
  const failed = checks.filter((c) => !c.ok);
  const evidenceJson = JSON.stringify({
    spec: history.spec.name,
    range,
    chunkRawHash: forged.rawHash,
    mismatches: failed.map((f) => ({
      account: f.account,
      before: f.before.toString(),
      after: f.after.toString(),
      expectedDelta: f.expectedDelta.toString(),
      actualDelta: f.actualDelta.toString(),
    })),
  });
  ms.flag = Date.now() - t;

  return {
    victim,
    hidden,
    range,
    honest: { digest: honest.blob.digest, rawHash: honest.rawHash, rows: honest.rows },
    forged: { digest: forged.blob.digest, rawHash: forged.rawHash, rows: forged.rows },
    integrityProblems: integrity.problems,
    rowTruth: { checked: victimRows.length, failed: failedRows.length },
    reconciliation: { checks: checks.length, failed },
    victimCheck: checks.find((c) => c.account === victim),
    flag: {
      reason: FLAG_REASON.Reconciliation,
      reasonName: "Reconciliation",
      evidence: blake2AsHex(evidenceJson, 256),
      evidenceJson,
    },
    ms,
  };
}
