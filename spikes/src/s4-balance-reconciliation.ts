/**
 * S4: Validate windowed balance reconciliation (verification level L3) on Polkadot Asset Hub, and
 * estimate the data volume of the balance-history spec over the whole Revive window.
 *
 * Part A, reconciliation: for a recent window [A, B] of finalized blocks, decode every
 * `Balances.*` event, map it to a delta on the account's total balance (free + reserved), and
 * check, for EVERY account touched in the window, that
 *     total(B) - total(A - 1) == sum(deltas in [A, B])
 * using `System.Account` read at the two boundary blocks (archive state).
 *
 * Part B, volume: sample several short windows spread across the Revive window, count the
 * rows the spec would emit, and measure canonical NDJSON size and gzip ratio.
 */
import { gzipSync } from "node:zlib";
import { WsProvider } from "@polkadot/api";
import { Metadata, TypeRegistry } from "@polkadot/types";
import { hexToU8a, u8aConcat, u8aToHex } from "@polkadot/util";
import { blake2AsU8a, xxhashAsHex, xxhashAsU8a } from "@polkadot/util-crypto";
import {
  ENDPOINTS,
  log,
  mapPool,
  nowIso,
  POLKADOT_AH_REVIVE_START,
  withTimeout,
  writeResult,
} from "./common.js";

const SYSTEM_EVENTS_KEY = `${xxhashAsHex("System", 128)}${xxhashAsHex("Events", 128).slice(2)}`;
const SYSTEM_ACCOUNT_PREFIX = u8aConcat(xxhashAsU8a("System", 128), xxhashAsU8a("Account", 128));
const WINDOW_BLOCKS = Number(process.env.S4_WINDOW ?? 1200);
const VOLUME_SAMPLES = 10;
const VOLUME_SAMPLE_BLOCKS = 150;
const CONCURRENCY = 32;

/**
 * Delta rules on total = free + reserved, per Balances event. `null` = absolute/unknown change:
 * the account cannot be reconciled by deltas and is reported separately.
 * Accounts are referenced by event field name; amounts by field name.
 */
type Rule = { minus?: string; plus?: string; amount?: string; absolute?: string } | "zero";
const RULES: Record<string, Rule> = {
  Endowed: "zero", // emitted alongside the Transfer/Deposit/Minted that funds the account
  DustLost: { minus: "account", amount: "amount" },
  Transfer: { minus: "from", plus: "to", amount: "amount" },
  BalanceSet: { absolute: "who" },
  Reserved: "zero",
  Unreserved: "zero",
  ReserveRepatriated: { minus: "from", plus: "to", amount: "amount" },
  Deposit: { plus: "who", amount: "amount" },
  Withdraw: { minus: "who", amount: "amount" },
  Slashed: { minus: "who", amount: "amount" },
  Minted: { plus: "who", amount: "amount" },
  MintedCredit: "zero",
  Burned: { minus: "who", amount: "amount" },
  BurnedDebt: "zero",
  Suspended: { minus: "who", amount: "amount" },
  Restored: { plus: "who", amount: "amount" },
  Upgraded: "zero",
  Issued: "zero",
  Rescinded: "zero",
  Locked: "zero",
  Unlocked: "zero",
  Frozen: "zero",
  Thawed: "zero",
  TotalIssuanceForced: "zero",
  Held: "zero",
  BurnedHeld: { minus: "who", amount: "amount" },
  TransferOnHold: { minus: "source", plus: "dest", amount: "amount" },
  TransferAndHold: { minus: "source", plus: "dest", amount: "transferred" },
  Released: "zero",
};

type Send = <T>(method: string, params: unknown[]) => Promise<T>;

interface Meta {
  registry: TypeRegistry;
  eventsTypeId: number;
  accountTypeId: number;
}

interface Row {
  block: number;
  eventIndex: number;
  kind: string;
  from: string | null;
  to: string | null;
  amount: string;
}

function lookupStorageType(metadata: Metadata, pallet: string, item: string): number {
  const entry = metadata.asLatest.pallets
    .find((p) => p.name.toString() === pallet)
    ?.storage.unwrap()
    .items.find((i) => i.name.toString() === item);
  if (!entry) throw new Error(`no ${pallet}.${item}`);
  return entry.type.isPlain ? entry.type.asPlain.toNumber() : entry.type.asMap.value.toNumber();
}

async function main(): Promise<void> {
  const provider = new WsProvider(ENDPOINTS.polkadotAssetHub, false);
  await provider.connect();
  await withTimeout(provider.isReady, 20_000, "ready");
  const send: Send = (method, params) => withTimeout(provider.send(method, params), 60_000, method);

  const specAt = async (hash: string) =>
    (await send<{ specVersion: number }>("state_getRuntimeVersion", [hash])).specVersion;
  const metaCache = new Map<number, Meta>();
  const metaFor = async (hash: string): Promise<Meta> => {
    const spec = await specAt(hash);
    const cached = metaCache.get(spec);
    if (cached) return cached;
    const hex = await send<`0x${string}`>("state_getMetadata", [hash]);
    const registry = new TypeRegistry();
    const metadata = new Metadata(registry, hex);
    registry.setMetadata(metadata);
    const meta = {
      registry,
      eventsTypeId: lookupStorageType(metadata, "System", "Events"),
      accountTypeId: lookupStorageType(metadata, "System", "Account"),
    };
    metaCache.set(spec, meta);
    return meta;
  };

  const hashesOf = async (blocks: number[]): Promise<string[]> => {
    const out: string[] = [];
    for (let i = 0; i < blocks.length; i += 500) {
      out.push(...(await send<string[]>("chain_getBlockHash", [blocks.slice(i, i + 500)])));
    }
    return out;
  };

  /** Decodes the Balances events of one block into rows (executing runtime = parent state). */
  const balanceRows = async (block: number, hash: string, parentHash: string) => {
    const meta = await metaFor(parentHash);
    const raw = await send<string | null>("state_getStorage", [SYSTEM_EVENTS_KEY, hash]);
    const rows: Row[] = [];
    const absolute: string[] = [];
    const unknown: string[] = [];
    if (!raw) return { rows, absolute, unknown, rawBytes: 0 };
    const records = meta.registry.createType(
      meta.registry.createLookupType(meta.eventsTypeId),
      hexToU8a(raw),
    ) as unknown as {
      event: {
        section: string;
        method: string;
        data: { toHex(): string; toString(): string }[];
        meta: { fields: { name: { toString(): string } }[] };
      };
    }[];
    records.forEach((record, eventIndex) => {
      const { section, method } = record.event;
      if (section !== "balances") return;
      const rule = RULES[method];
      const names = record.event.meta.fields.map((f) => f.name.toString());
      // Accounts as canonical hex AccountId32 (toJSON would yield SS58 strings); amounts as decimal.
      const codec = (name: string) => record.event.data[names.indexOf(name)];
      const account = (name: string) => codec(name)?.toHex() ?? "";
      const decimal = (name: string) => codec(name)?.toString() ?? "0";
      if (rule === undefined) {
        unknown.push(`${method}@${block}`);
        return;
      }
      if (rule === "zero") return;
      if (rule.absolute) {
        absolute.push(account(rule.absolute));
        return;
      }
      const amount = BigInt(decimal(rule.amount as string));
      rows.push({
        block,
        eventIndex,
        kind: method,
        from: rule.minus ? account(rule.minus) : null,
        to: rule.plus ? account(rule.plus) : null,
        amount: amount.toString(),
      });
    });
    return { rows, absolute, unknown, rawBytes: (raw.length - 2) / 2 };
  };

  // ---------- Part A: reconciliation ----------
  const finalizedHash = await send<string>("chain_getFinalizedHead", []);
  const finalized = Number.parseInt(
    (await send<{ number: string }>("chain_getHeader", [finalizedHash])).number,
    16,
  );
  const B = finalized;
  const A = B - WINDOW_BLOCKS + 1;
  const blocks = Array.from({ length: B - A + 2 }, (_, i) => A - 1 + i); // A-1 .. B
  const hashes = await hashesOf(blocks);
  const hashAt = (block: number) => hashes[block - (A - 1)] as string;
  if ((await specAt(hashAt(A - 1))) !== (await specAt(hashAt(B)))) {
    throw new Error("runtime upgrade inside the reconciliation window; rerun later");
  }

  const startedA = performance.now();
  const perBlock = await mapPool(blocks.slice(1), CONCURRENCY, (block) =>
    balanceRows(block, hashAt(block), hashAt(block - 1)),
  );
  const rows = perBlock.flatMap((b) => b.rows);
  const absoluteAccounts = new Set(perBlock.flatMap((b) => b.absolute));
  const unknownEvents = perBlock.flatMap((b) => b.unknown);
  log(
    `window #${A}..#${B}: ${rows.length} delta rows decoded in ${((performance.now() - startedA) / 1000).toFixed(1)} s`,
  );

  const deltas = new Map<string, bigint>();
  const bump = (account: string | null, value: bigint) => {
    if (account) deltas.set(account, (deltas.get(account) ?? 0n) + value);
  };
  for (const row of rows) {
    bump(row.from, -BigInt(row.amount));
    bump(row.to, BigInt(row.amount));
  }

  const accountKey = (account: string) => {
    const id = hexToU8a(account);
    return u8aToHex(u8aConcat(SYSTEM_ACCOUNT_PREFIX, blake2AsU8a(id, 128), id));
  };
  const metaB = await metaFor(hashAt(B));
  const accountType = metaB.registry.createLookupType(metaB.accountTypeId);
  const totalAt = async (account: string, hash: string): Promise<bigint> => {
    const raw = await send<string | null>("state_getStorage", [accountKey(account), hash]);
    if (!raw) return 0n;
    const info = metaB.registry.createType(accountType, hexToU8a(raw)) as unknown as {
      data: { free: { toBigInt(): bigint }; reserved: { toBigInt(): bigint } };
    };
    return info.data.free.toBigInt() + info.data.reserved.toBigInt();
  };

  const accounts = [...deltas.keys()].filter((a) => !absoluteAccounts.has(a));
  const outcomes = await mapPool(accounts, CONCURRENCY, async (account) => {
    const before = await totalAt(account, hashAt(A - 1));
    const after = await totalAt(account, hashAt(B));
    const expected = deltas.get(account) ?? 0n;
    const actual = after - before;
    return { account, before, after, expected, actual, ok: expected === actual };
  });
  const failures = outcomes.filter((o) => !o.ok);
  log(
    `reconciled ${outcomes.length - failures.length}/${outcomes.length} accounts (${absoluteAccounts.size} skipped: absolute BalanceSet)`,
  );

  const failureDetails = failures.slice(0, 15).map((f) => ({
    account: f.account,
    expectedDelta: f.expected.toString(),
    actualDelta: f.actual.toString(),
    difference: (f.actual - f.expected).toString(),
    rows: rows.filter((r) => r.from === f.account || r.to === f.account).slice(0, 12),
  }));

  // ---------- Part B: volume estimate over the Revive window ----------
  const span = B - POLKADOT_AH_REVIVE_START;
  const sampleStarts = Array.from({ length: VOLUME_SAMPLES }, (_, i) =>
    Math.floor(POLKADOT_AH_REVIVE_START + ((i + 0.5) * span) / VOLUME_SAMPLES),
  );
  let sampledBlocks = 0;
  let sampledRows = 0;
  const kinds: Record<string, number> = {};
  const ndjsonParts: string[] = [];
  for (const start of sampleStarts) {
    const sBlocks = Array.from({ length: VOLUME_SAMPLE_BLOCKS + 1 }, (_, i) => start - 1 + i);
    const sHashes = await hashesOf(sBlocks);
    const sRows = await mapPool(sBlocks.slice(1), CONCURRENCY, (block, i) =>
      balanceRows(block, sHashes[i + 1] as string, sHashes[i] as string),
    );
    for (const r of sRows) {
      sampledRows += r.rows.length;
      for (const row of r.rows) {
        ndjsonParts.push(JSON.stringify(row));
        kinds[row.kind] = (kinds[row.kind] ?? 0) + 1;
      }
    }
    sampledBlocks += VOLUME_SAMPLE_BLOCKS;
  }
  const ndjson = `${ndjsonParts.join("\n")}\n`;
  const rawBytes = Buffer.byteLength(ndjson);
  const gzBytes = gzipSync(ndjson, { level: 9 }).length;
  const rowsPerBlock = sampledRows / sampledBlocks;
  const bytesPerRow = rawBytes / Math.max(sampledRows, 1);
  const estimatedRows = Math.round(rowsPerBlock * span);
  const volume = {
    sampledWindows: VOLUME_SAMPLES,
    sampledBlocks,
    sampledRows,
    rowsByKind: Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1])),
    rowsPerBlock: Number(rowsPerBlock.toFixed(3)),
    ndjsonBytesPerRow: Number(bytesPerRow.toFixed(1)),
    gzipRatio: Number((rawBytes / gzBytes).toFixed(2)),
    reviveWindowBlocks: span,
    estimatedRows,
    estimatedNdjsonMB: Number(((estimatedRows * bytesPerRow) / 1e6).toFixed(1)),
    estimatedGzipMB: Number(
      ((estimatedRows * bytesPerRow) / (rawBytes / gzBytes) / 1e6).toFixed(1),
    ),
    estimatedChunksAt8MB: Math.ceil(
      (estimatedRows * bytesPerRow) / (rawBytes / gzBytes) / 8_000_000,
    ),
  };
  log(
    `volume: ${volume.rowsPerBlock} rows/block → ~${volume.estimatedRows} rows, ~${volume.estimatedGzipMB} MB gzip`,
  );

  const result = {
    spike: "S4",
    measuredAt: nowIso(),
    chain: "polkadot-asset-hub",
    reconciliation: {
      window: { from: A, to: B, blocks: WINDOW_BLOCKS, specVersion: await specAt(hashAt(B)) },
      deltaRows: rows.length,
      accountsChecked: outcomes.length,
      accountsReconciled: outcomes.length - failures.length,
      accountsSkippedAbsolute: absoluteAccounts.size,
      unknownEvents,
      failureDetails,
      rules: RULES,
    },
    volume,
  };
  log(`result written to ${writeResult("s4-balance-reconciliation", result)}`);
  await provider.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
