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
  const versionAt = async (block: number) =>
    (await getRuntimeVersion(client, await options.hashOf(block))).specVersion;

  const points: { block: number; version: number }[] = [];
  const step = Math.max(1, Math.floor((toBlock - start) / (samples - 1)));
  for (let block = start; block < toBlock; block += step) {
    points.push({ block, version: await versionAt(block) });
  }
  points.push({ block: toBlock, version: await versionAt(toBlock) });

  const segments: RuntimeSegment[] = [{ fromBlock: start, specVersion: points[0]?.version ?? 0 }];
  for (let i = 1; i < points.length; i++) {
    let left = points[i - 1] as { block: number; version: number };
    const right = points[i] as { block: number; version: number };
    while (left.version !== right.version) {
      // Find the first block after `left` whose version differs from left.version.
      let lo = left.block;
      let hi = right.block;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if ((await versionAt(mid)) === left.version) lo = mid;
        else hi = mid;
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
