import { Metadata, TypeRegistry } from "@polkadot/types";
import type { RpcClient } from "./rpc.js";

export interface RuntimeVersion {
  specName: string;
  specVersion: number;
}

/** Runtime version in the POST-state of `blockHash` (i.e. after that block executed). */
export async function getRuntimeVersion(
  client: RpcClient,
  blockHash: string,
): Promise<RuntimeVersion> {
  const v = await client.send<{ specName: string; specVersion: number }>(
    "state_getRuntimeVersion",
    [blockHash],
  );
  return { specName: v.specName, specVersion: v.specVersion };
}

/** One runtime-version segment: `specVersion` is the post-state version from `fromBlock` on. */
export interface RuntimeSegment {
  fromBlock: number;
  specVersion: number;
}

/**
 * Post-state runtime versions over a block range, built by sampling and binary search.
 *
 * Decoding rule (spike S1): the events of block N were produced by the runtime that EXECUTED
 * block N, which is the post-state runtime of block N−1. A block that applies an upgrade already
 * reports the new version in its own post-state, but its events use the old one.
 */
export class RuntimeMap {
  readonly segments: readonly RuntimeSegment[];

  constructor(segments: RuntimeSegment[]) {
    if (segments.length === 0) throw new Error("RuntimeMap needs at least one segment");
    this.segments = [...segments].sort((a, b) => a.fromBlock - b.fromBlock);
  }

  /** Post-state version of `block`. */
  postStateVersion(block: number): number {
    let version: number | undefined;
    for (const segment of this.segments) {
      if (segment.fromBlock > block) break;
      version = segment.specVersion;
    }
    if (version === undefined) throw new Error(`block #${block} precedes the runtime map`);
    return version;
  }

  /**
   * Version whose metadata decodes the events (and post-state storage) of `block`. The genesis
   * block has no executing block; its state is decoded with its own runtime.
   */
  executingVersion(block: number): number {
    return this.postStateVersion(block === 0 ? 0 : block - 1);
  }

  /** Blocks whose post-state version differs from their parent's (runtime upgrade blocks). */
  get upgradeBlocks(): number[] {
    return this.segments.slice(1).map((s) => s.fromBlock);
  }
}

/** Storage key of `System.LastRuntimeUpgrade` (twox128("System") ++ twox128("LastRuntimeUpgrade")). */
export const LAST_RUNTIME_UPGRADE_KEY =
  "0x26aa394eea5630e07c48ae0c9558cef7f9cce9c888469bb1a0dceaa129672ef8";

/** Decodes the leading SCALE Compact<u32> of a hex value (here: LastRuntimeUpgradeInfo.spec_version). */
export function decodeCompactU32(hex: string): number {
  const b = hexToBytes(hex);
  const first = b[0] ?? 0;
  switch (first & 3) {
    case 0:
      return first >> 2;
    case 1:
      return (first | ((b[1] ?? 0) << 8)) >> 2;
    case 2:
      return ((first | ((b[1] ?? 0) << 8) | ((b[2] ?? 0) << 16) | ((b[3] ?? 0) << 24)) >>> 2) >>> 0;
    default:
      return ((b[1] ?? 0) | ((b[2] ?? 0) << 8) | ((b[3] ?? 0) << 16) | ((b[4] ?? 0) << 24)) >>> 0;
  }
}

/** Probes per round when locating a runtime upgrade boundary. */
const SEARCH_WAYS = 16;

export interface BuildRuntimeMapOptions {
  /** Number of evenly spaced samples before refining boundaries (default 64). */
  samples?: number;
  /** Resolves a block number to its hash; injected so callers can batch/cache. */
  hashOf: (block: number) => Promise<string>;
}

/**
 * Builds the post-state RuntimeMap for [fromBlock, toBlock]. It starts at fromBlock − 2 so the
 * executing version is known for every block from fromBlock − 1 on: events need it from
 * fromBlock, and window reconciliation reads storage at fromBlock − 1. Every boundary between samples with different
 * versions is located exactly by binary search; multiple upgrades between two samples are found
 * by re-scanning the right half.
 */
export async function buildRuntimeMap(
  client: RpcClient,
  fromBlock: number,
  toBlock: number,
  options: BuildRuntimeMapOptions,
): Promise<RuntimeMap> {
  const start = Math.max(0, fromBlock - 2);
  const samples = Math.max(2, options.samples ?? 64);
  // The post-state version of block b is the version that executed block b + 1, which FRAME
  // records in System.LastRuntimeUpgrade at the start of b + 1. Reading that small storage value is
  // cheap, while state_getRuntimeVersion executes the runtime: on the public Portaldot node each
  // switch between runtime versions costs ~8.5 s, so a binary search over an upgrade boundary took
  // minutes. state_getRuntimeVersion remains the fallback (last block, chains without the value).
  const versionAt = async (block: number) => {
    if (block < toBlock) {
      const raw = await client.send<string | null>("state_getStorage", [
        LAST_RUNTIME_UPGRADE_KEY,
        await options.hashOf(block + 1),
      ]);
      if (raw) return decodeCompactU32(raw);
    }
    return (await getRuntimeVersion(client, await options.hashOf(block))).specVersion;
  };

  // Samples and search probes are independent reads, so they are issued in parallel: the map
  // costs a few round trips instead of one per probe.
  const step = Math.max(1, Math.floor((toBlock - start) / (samples - 1)));
  const sampleBlocks: number[] = [];
  for (let block = start; block < toBlock; block += step) sampleBlocks.push(block);
  sampleBlocks.push(toBlock);
  const points = await Promise.all(
    sampleBlocks.map(async (block) => ({ block, version: await versionAt(block) })),
  );

  const segments: RuntimeSegment[] = [{ fromBlock: start, specVersion: points[0]?.version ?? 0 }];
  for (let i = 1; i < points.length; i++) {
    let left = points[i - 1] as { block: number; version: number };
    const right = points[i] as { block: number; version: number };
    while (left.version !== right.version) {
      // Find the first block after `left` whose version differs from left.version.
      let lo = left.block;
      let hi = right.block;
      while (hi - lo > 1) {
        // k-ary search: probe up to SEARCH_WAYS evenly spaced blocks at once.
        const probes = [
          ...new Set(
            Array.from({ length: Math.min(SEARCH_WAYS, hi - lo - 1) }, (_, j) =>
              Math.floor(lo + ((j + 1) * (hi - lo)) / (Math.min(SEARCH_WAYS, hi - lo - 1) + 1)),
            ),
          ),
        ].filter((b) => b > lo && b < hi);
        const versions = await Promise.all(probes.map(versionAt));
        const first = versions.findIndex((v) => v !== left.version);
        if (first === -1) lo = probes.at(-1) ?? lo + 1;
        else {
          hi = probes[first] as number;
          if (first > 0) lo = probes[first - 1] as number;
        }
      }
      const version = hi === right.block ? right.version : await versionAt(hi);
      segments.push({ fromBlock: hi, specVersion: version });
      left = { block: hi, version };
    }
  }
  return new RuntimeMap(segments);
}

/** Persistent or in-memory store of raw SCALE metadata per spec version. */
export interface MetadataStore {
  get(specVersion: number): Promise<Uint8Array | undefined>;
  put(specVersion: number, metadata: Uint8Array): Promise<void>;
}

export class MemoryMetadataStore implements MetadataStore {
  readonly #items = new Map<number, Uint8Array>();
  async get(specVersion: number) {
    return this.#items.get(specVersion);
  }
  async put(specVersion: number, metadata: Uint8Array) {
    this.#items.set(specVersion, metadata);
  }
}

/** A type registry for one runtime version plus lookups Potluck needs. */
export interface DecodingRuntime {
  specVersion: number;
  registry: TypeRegistry;
  metadata: Metadata;
  /** Pallet index → pallet name as declared in metadata (e.g. 10 → "Balances"). */
  palletNames: ReadonlyMap<number, string>;
  /** Lookup type id of a storage item's value. */
  storageTypeId(pallet: string, item: string): number;
}

export function createDecodingRuntime(
  specVersion: number,
  metadataBytes: Uint8Array,
): DecodingRuntime {
  const registry = new TypeRegistry();
  const metadata = new Metadata(registry, metadataBytes);
  registry.setMetadata(metadata);
  const latest = metadata.asLatest;
  const palletNames = new Map<number, string>();
  for (const pallet of latest.pallets)
    palletNames.set(pallet.index.toNumber(), pallet.name.toString());
  return {
    specVersion,
    registry,
    metadata,
    palletNames,
    storageTypeId(pallet, item) {
      const entry = latest.pallets
        .find((p) => p.name.toString() === pallet)
        ?.storage.unwrapOr(null)
        ?.items.find((i) => i.name.toString() === item);
      if (!entry) throw new Error(`spec ${specVersion} has no storage ${pallet}.${item}`);
      return entry.type.isPlain ? entry.type.asPlain.toNumber() : entry.type.asMap.value.toNumber();
    },
  };
}

/**
 * Loads decoding runtimes by spec version: memory cache → MetadataStore → RPC
 * (`state_getMetadata` at a block whose post-state has that version).
 */
export class RuntimeLoader {
  readonly #runtimes = new Map<number, Promise<DecodingRuntime>>();

  constructor(
    private readonly client: RpcClient,
    private readonly store: MetadataStore = new MemoryMetadataStore(),
  ) {}

  /** `atBlockHash` must be a block whose post-state runtime is `specVersion`. */
  load(specVersion: number, atBlockHash: string): Promise<DecodingRuntime> {
    let runtime = this.#runtimes.get(specVersion);
    if (!runtime) {
      runtime = this.#fetch(specVersion, atBlockHash);
      this.#runtimes.set(specVersion, runtime);
      runtime.catch(() => this.#runtimes.delete(specVersion));
    }
    return runtime;
  }

  async #fetch(specVersion: number, atBlockHash: string): Promise<DecodingRuntime> {
    let bytes = await this.store.get(specVersion);
    if (!bytes) {
      const actual = await getRuntimeVersion(this.client, atBlockHash);
      if (actual.specVersion !== specVersion) {
        throw new Error(
          `block ${atBlockHash} has spec ${actual.specVersion}, expected ${specVersion}`,
        );
      }
      const hex = await this.client.send<string>("state_getMetadata", [atBlockHash]);
      bytes = hexToBytes(hex);
      await this.store.put(specVersion, bytes);
    }
    return createDecodingRuntime(specVersion, bytes);
  }
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hexToBytes: odd length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
