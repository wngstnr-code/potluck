import { u8aConcat, u8aToHex } from "@polkadot/util";
import { blake2AsU8a, xxhashAsU8a } from "@polkadot/util-crypto";
import type { Spec } from "@potluck/spec";
import type { IndexedRow } from "./engine.js";
import { mapPool, type RpcClient } from "./rpc.js";
import { type DecodingRuntime, hexToBytes } from "./runtime.js";

export type BalanceDeltaRule = Extract<Spec["reconcile"], { type: "balance-delta" }>;

export function balanceRule(spec: Spec): BalanceDeltaRule {
  if (spec.reconcile.type !== "balance-delta")
    throw new Error(`spec ${spec.name} has no balance-delta rule`);
  return spec.reconcile;
}

/** What the rows imply about one account's value at the end of the window. */
export interface Expectation {
  /** Value at the end of `resetBlock` when the account was reset (e.g. reaped → 0). */
  reset?: { block: number; value: bigint };
  /** Sum of deltas after the reset block, or over the whole window without a reset. */
  delta: bigint;
}

export interface Deltas {
  expectations: Map<string, Expectation>;
  /** Accounts touched by an opaque row (e.g. BalanceSet): not reconcilable. */
  opaque: Set<string>;
}

/**
 * Folds the rows (those passing the rule's `when` filter) into per-account expectations:
 * expected(end) = (last reset value, or the value before the window) + deltas after that reset.
 * A reset applies at the end of its block, so the account's other rows in that block are part of
 * it (System.KilledAccount is emitted before the Transfer that empties the account).
 */
export function balanceDeltas(spec: Spec, rows: readonly IndexedRow[]): Deltas {
  const rule = balanceRule(spec);
  const when = rule.when;
  const relevant = when ? rows.filter((r) => r.cells[when.column] === when.equals) : rows;
  const opaque = new Set<string>();
  const lastReset = new Map<string, { block: number; value: bigint }>();
  for (const row of relevant) {
    if (row.effect === "opaque") {
      for (const column of spec.accounts) {
        const account = row.cells[column];
        if (account) opaque.add(account);
      }
    } else if (row.effect === "reset") {
      const account = row.cells[rule.credit];
      if (account) {
        lastReset.set(account, { block: row.block, value: BigInt(row.cells[rule.amount] ?? "0") });
      }
    }
  }
  const expectations = new Map<string, Expectation>();
  for (const [account, reset] of lastReset) expectations.set(account, { reset, delta: 0n });
  const bump = (account: string | null | undefined, block: number, value: bigint) => {
    if (!account) return;
    let expectation = expectations.get(account);
    if (!expectation) {
      expectation = { delta: 0n };
      expectations.set(account, expectation);
    }
    if (expectation.reset && block <= expectation.reset.block) return;
    expectation.delta += value;
  };
  for (const row of relevant) {
    if (row.effect !== "delta") continue;
    const amount = BigInt(row.cells[rule.amount] ?? "0");
    bump(row.cells[rule.debit], row.block, -amount);
    bump(row.cells[rule.credit], row.block, amount);
  }
  return { expectations, opaque };
}

/** Storage key of a single-key map entry, using the hasher declared in the runtime metadata. */
export function storageMapKey(
  runtime: DecodingRuntime,
  pallet: string,
  item: string,
  key: string,
): string {
  const entry = runtime.metadata.asLatest.pallets
    .find((p) => p.name.toString() === pallet)
    ?.storage.unwrapOr(null)
    ?.items.find((i) => i.name.toString() === item);
  if (!entry?.type.isMap)
    throw new Error(`spec ${runtime.specVersion}: ${pallet}.${item} is not a map`);
  const hashers = entry.type.asMap.hashers;
  if (hashers.length !== 1)
    throw new Error(`${pallet}.${item}: only single-key maps are supported`);
  const keyBytes = hexToBytes(key);
  // Runtime values are spelled "Blake2_128Concat" while the typings say "Blake2128Concat".
  const hasher = String(hashers[0]?.type ?? "").replaceAll("_", "");
  let hashed: Uint8Array;
  switch (hasher) {
    case "Blake2128Concat":
      hashed = u8aConcat(blake2AsU8a(keyBytes, 128), keyBytes);
      break;
    case "Blake2128":
      hashed = blake2AsU8a(keyBytes, 128);
      break;
    case "Blake2256":
      hashed = blake2AsU8a(keyBytes, 256);
      break;
    case "Twox64Concat":
      hashed = u8aConcat(xxhashAsU8a(keyBytes, 64), keyBytes);
      break;
    case "Identity":
      hashed = keyBytes;
      break;
    default:
      throw new Error(`${pallet}.${item}: unsupported hasher ${hasher}`);
  }
  return u8aToHex(u8aConcat(xxhashAsU8a(pallet, 128), xxhashAsU8a(item, 128), hashed));
}

/**
 * Reads the rule's storage value for `account` at `blockHash` and sums its paths
 * (e.g. data.free + data.reserved). A missing entry counts as 0 (reaped/never created).
 * `runtime` must be the runtime that executed the block (RuntimeMap.executingVersion).
 */
export async function readSummedBalance(
  client: RpcClient,
  runtime: DecodingRuntime,
  rule: BalanceDeltaRule,
  account: string,
  blockHash: string,
): Promise<bigint> {
  const key = storageMapKey(runtime, rule.storage.pallet, rule.storage.item, account);
  const raw = await client.send<string | null>("state_getStorage", [key, blockHash]);
  if (!raw) return 0n;
  const type = runtime.registry.createLookupType(
    runtime.storageTypeId(rule.storage.pallet, rule.storage.item),
  );
  const value = runtime.registry.createType(type, hexToBytes(raw)) as unknown as Record<
    string,
    unknown
  >;
  let total = 0n;
  for (const path of rule.sum) {
    let node: unknown = value;
    for (const part of path.split("."))
      node = (node as Record<string, unknown> | undefined)?.[part];
    const big = (node as { toBigInt?: () => bigint } | undefined)?.toBigInt?.();
    if (big === undefined)
      throw new Error(`${rule.storage.pallet}.${rule.storage.item}: no numeric path ${path}`);
    total += big;
  }
  return total;
}

export interface AccountReconciliation {
  account: string;
  before: bigint;
  after: bigint;
  expectedDelta: bigint;
  actualDelta: bigint;
  ok: boolean;
}

export interface ReconcileOptions {
  client: RpcClient;
  spec: Spec;
  /** Rows covering exactly [fromBlock, toBlock]. */
  rows: readonly IndexedRow[];
  fromBlock: number;
  toBlock: number;
  hashOf: (block: number) => Promise<string>;
  /** Runtime that executed `block`. */
  runtimeFor: (block: number) => Promise<DecodingRuntime>;
  /** Accounts to check; defaults to every non-opaque account touched by the rows. */
  accounts?: readonly string[];
  concurrency?: number;
}

/**
 * Windowed reconciliation (verification level L3): for each account, value(toBlock) must equal
 * value(fromBlock − 1) plus its row deltas in [fromBlock, toBlock] — or, after a reset, the reset
 * value plus the deltas of later blocks.
 * An omitted, altered or invented balance row makes the affected account fail.
 * Accounts not touched by any row must have an unchanged value (delta 0).
 */
export async function reconcileAccounts(
  options: ReconcileOptions,
): Promise<AccountReconciliation[]> {
  const { client, spec, rows, fromBlock, toBlock } = options;
  const rule = balanceRule(spec);
  const { expectations, opaque } = balanceDeltas(spec, rows);
  const accounts = (options.accounts ?? [...expectations.keys()]).filter((a) => !opaque.has(a));
  const [beforeHash, afterHash] = await Promise.all([
    options.hashOf(fromBlock - 1),
    options.hashOf(toBlock),
  ]);
  const [beforeRuntime, afterRuntime] = await Promise.all([
    options.runtimeFor(fromBlock - 1),
    options.runtimeFor(toBlock),
  ]);
  return mapPool(accounts, options.concurrency ?? 16, async (account) => {
    const [before, after] = await Promise.all([
      readSummedBalance(client, beforeRuntime, rule, account, beforeHash),
      readSummedBalance(client, afterRuntime, rule, account, afterHash),
    ]);
    const expectation = expectations.get(account) ?? { delta: 0n };
    const expectedAfter = (expectation.reset?.value ?? before) + expectation.delta;
    return {
      account,
      before,
      after,
      expectedDelta: expectedAfter - before,
      actualDelta: after - before,
      ok: expectedAfter === after,
    };
  });
}
