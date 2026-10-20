import type { Codec } from "@polkadot/types/types";
import { xxhashAsHex } from "@polkadot/util-crypto";
import { getBlockHashes, mapPool, type RpcClient } from "./rpc.js";
import { type DecodingRuntime, hexToBytes } from "./runtime.js";

export const SYSTEM_EVENTS_KEY = `${xxhashAsHex("System", 128)}${xxhashAsHex("Events", 128).slice(2)}`;

export interface EventField {
  /** Metadata field name (snake_case), e.g. "friend_group_index". */
  name: string;
  /** Metadata type name, e.g. "T::AccountId". */
  typeName: string;
  value: Codec;
}

export interface DecodedEvent {
  block: number;
  /** Position in the block's System.Events vector. */
  eventIndex: number;
  /** Pallet name as declared in metadata, e.g. "Balances". */
  pallet: string;
  /** Event variant name, e.g. "Transfer". */
  event: string;
  fields: EventField[];
}

interface RawEventRecord {
  event: {
    index: { toU8a(): Uint8Array };
    method: string;
    data: Codec[];
    meta: {
      fields: {
        name: { toString(): string; isSome?: boolean };
        typeName: { toString(): string };
      }[];
    };
  };
}

/**
 * Decodes the SCALE `System.Events` value of `block` with `runtime`, which MUST be the block's
 * executing runtime (see RuntimeMap.executingVersion). Throws unless every byte is consumed,
 * so a wrong runtime can never produce silently wrong rows.
 */
export function decodeEvents(
  runtime: DecodingRuntime,
  block: number,
  raw: Uint8Array | string,
): DecodedEvent[] {
  const bytes = typeof raw === "string" ? hexToBytes(raw) : raw;
  if (bytes.length === 0) return [];
  const type = runtime.registry.createLookupType(runtime.storageTypeId("System", "Events"));
  const records = runtime.registry.createType(type, bytes) as unknown as RawEventRecord[] & {
    encodedLength: number;
  };
  if (records.encodedLength !== bytes.length) {
    throw new Error(
      `block #${block}: decoded ${records.encodedLength} of ${bytes.length} bytes with spec ${runtime.specVersion}`,
    );
  }
  return records.map((record, eventIndex) => {
    const palletIndex = record.event.index.toU8a()[0] as number;
    const pallet = runtime.palletNames.get(palletIndex);
    if (!pallet) throw new Error(`block #${block}: unknown pallet index ${palletIndex}`);
    const fields = record.event.meta.fields.map((f, i) => ({
      name: f.name.toString(),
      typeName: f.typeName.toString(),
      value: record.event.data[i] as Codec,
    }));
    return { block, eventIndex, pallet, event: record.event.method, fields };
  });
}

/** Fetches the raw `System.Events` storage of a block (empty when the block emitted none). */
export async function fetchRawEvents(client: RpcClient, blockHash: string): Promise<Uint8Array> {
  const raw = await client.send<string | null>("state_getStorage", [SYSTEM_EVENTS_KEY, blockHash]);
  return raw ? hexToBytes(raw) : new Uint8Array();
}

export interface RawBlockEvents {
  block: number;
  hash: string;
  /** SCALE `System.Events` value; empty when the block emitted no events. */
  raw: Uint8Array;
}

export interface ScanOptions {
  /** Blocks per `state_queryStorage` call (default 1000). */
  window?: number;
  /** Parallel calls (default 8). */
  concurrency?: number;
  /** "auto" (default): use `state_queryStorage`, fall back per block if the node refuses it. */
  strategy?: "auto" | "per-block";
  onProgress?: (done: number, total: number) => void;
}

export interface ScanResult {
  blocks: RawBlockEvents[];
  strategy: "query-storage" | "per-block";
}

/**
 * Fetches `System.Events` for every block of [fromBlock, toBlock].
 *
 * Fast path: `state_queryStorage` (allowed on Portaldot, "unsafe" on Polkadot public nodes) returns
 * only the blocks where the value CHANGED, so a block whose events are byte-identical to its
 * parent's (or both empty) is omitted. The value of every block is therefore reconstructed as the
 * latest change at or before it — exact, not sampled. Falls back to one `state_getStorage` per
 * block when the method is refused.
 */
export async function scanRawEvents(
  client: RpcClient,
  fromBlock: number,
  toBlock: number,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const numbers = Array.from({ length: toBlock - fromBlock + 1 }, (_, i) => fromBlock + i);
  const hashes = await getBlockHashes(client, numbers);
  const windowSize = options.window ?? 1000;
  const concurrency = options.concurrency ?? 8;
  let done = 0;
  const report = (n: number) => {
    done += n;
    options.onProgress?.(done, numbers.length);
  };

  const perBlock = async (): Promise<ScanResult> => {
    done = 0;
    const blocks = await mapPool(numbers, concurrency, async (block, i) => {
      const hash = hashes[i] as string;
      const raw = await fetchRawEvents(client, hash);
      report(1);
      return { block, hash, raw };
    });
    return { blocks, strategy: "per-block" };
  };
  if (options.strategy === "per-block") return perBlock();

  const windows: [number, number][] = [];
  for (let start = 0; start < numbers.length; start += windowSize) {
    windows.push([start, Math.min(start + windowSize, numbers.length) - 1]);
  }
  try {
    const parts = await mapPool(windows, concurrency, async ([a, b]) => {
      const changes = await client.send<{ block: string; changes: [string, string | null][] }[]>(
        "state_queryStorage",
        [[SYSTEM_EVENTS_KEY], hashes[a], hashes[b]],
      );
      const byHash = new Map<string, string | null>();
      for (const set of changes) {
        const change = set.changes.find(([key]) => key === SYSTEM_EVENTS_KEY);
        if (change) byHash.set(set.block, change[1]);
      }
      let current: Uint8Array | undefined;
      if (!byHash.has(hashes[a] as string)) {
        current = await fetchRawEvents(client, hashes[a] as string);
      }
      const out: RawBlockEvents[] = [];
      for (let i = a; i <= b; i++) {
        const hash = hashes[i] as string;
        if (byHash.has(hash)) {
          const value = byHash.get(hash);
          current = value ? hexToBytes(value) : new Uint8Array();
        }
        out.push({ block: numbers[i] as number, hash, raw: current ?? new Uint8Array() });
      }
      report(b - a + 1);
      return out;
    });
    return { blocks: parts.flat(), strategy: "query-storage" };
  } catch (error) {
    if (options.strategy === "auto" || options.strategy === undefined) {
      const message = String((error as Error).message ?? error);
      if (/unsafe|not found|does not exist|-32601/i.test(message)) return perBlock();
    }
    throw error;
  }
}
