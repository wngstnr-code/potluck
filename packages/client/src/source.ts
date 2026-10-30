import { type Manifest, parseManifest, REGISTRY_ABI, type RpcClient } from "@potluck/core";
import { parseSpec, type Spec, specHash } from "@potluck/spec";
import { createPublicClient, type Hex, http } from "viem";
import { fetchBlob } from "./blobs.js";

export interface ManifestEntry {
  manifest: Manifest;
  /** blake2b-256 of the manifest blob. */
  digest: string;
  /** Registry id, when the manifest came from the registry. */
  id?: number;
  /** Publisher H160 as recorded by the registry (or the manifest). */
  publisher: string | null;
  /** Public flags raised against the manifest in the registry. */
  flags: number;
}

/** A spec registered in PotluckRegistry. Registration is permissionless: judge it by its author. */
export interface RegisteredSpec {
  /** Spec hash (lower-case), which is also the digest of its TransactionStorage blob. */
  hash: string;
  /** H160 that registered it. */
  author: string;
  /** Unix seconds. */
  registeredAt: number;
  /** The spec, or null when its blob is unavailable (expired) or invalid; see `error`. */
  spec: Spec | null;
  error?: string;
}

/** Where a client finds manifests for a spec and the blobs they reference. */
export interface ManifestSource {
  list(spec: Spec): Promise<ManifestEntry[]>;
  blob(digest: string): Promise<Uint8Array>;
}

export interface PortaldotSourceOptions {
  /** Portaldot WSS client (bitswap_v1_get). */
  portaldot: RpcClient;
  /** Portaldot EVM JSON-RPC URL (CORS-enabled), used to read the registry. */
  evmRpcUrl: string;
  registry: Hex;
  /** How many recent manifests per spec to consider (default 32). */
  limit?: number;
}

/**
 * Reads manifests from PotluckRegistry and fetches every blob via bitswap. Nothing returned by the
 * registry or the node is trusted: each manifest must hash to its registered digest, belong to the
 * requested spec and source chain, and pass full manifest validation.
 */
export class PortaldotSource implements ManifestSource {
  readonly #evm;

  constructor(private readonly options: PortaldotSourceOptions) {
    this.#evm = createPublicClient({ transport: http(options.evmRpcUrl) });
  }

  async list(spec: Spec): Promise<ManifestEntry[]> {
    const hash = specHash(spec) as Hex;
    const records = await this.#evm.readContract({
      address: this.options.registry,
      abi: REGISTRY_ABI,
      functionName: "latest",
      args: [hash, BigInt(this.options.limit ?? 32)],
    });
    const entries: ManifestEntry[] = [];
    for (const record of records) {
      try {
        const manifest = parseManifest(
          await fetchBlob(this.options.portaldot, record.manifestDigest),
        );
        if (manifest.spec !== hash) throw new Error("manifest is for another spec");
        if (manifest.source.genesisHash !== spec.source.genesisHash)
          throw new Error("other source chain");
        if (manifest.chunksRoot !== record.chunksRoot.toLowerCase())
          throw new Error("chunksRoot differs from the registry");
        if (
          manifest.range.fromBlock !== Number(record.fromBlock) ||
          manifest.range.toBlock !== Number(record.toBlock)
        ) {
          throw new Error("range differs from the registry");
        }
        entries.push({
          manifest,
          digest: record.manifestDigest.toLowerCase(),
          publisher: record.publisher.toLowerCase(),
          flags: record.flags,
        });
      } catch {
        // Unusable manifest (expired blob, mismatch): ignore it; the client falls back to direct sync.
      }
    }
    return entries;
  }

  blob(digest: string): Promise<Uint8Array> {
    return fetchBlob(this.options.portaldot, digest);
  }

  /**
   * Fetches a spec by hash from TransactionStorage. The blob is digest-checked, then the parsed
   * spec must hash back to the same value (a non-canonical blob would not).
   */
  async spec(hash: string): Promise<Spec> {
    const bytes = await fetchBlob(this.options.portaldot, hash);
    const spec = parseSpec(JSON.parse(new TextDecoder().decode(bytes)));
    if (specHash(spec) !== hash.toLowerCase()) {
      throw new Error(`spec blob ${hash} is not in canonical form`);
    }
    return spec;
  }

  /** Every spec registered in the registry, in registration order, each fetched and checked. */
  async specs(): Promise<RegisteredSpec[]> {
    const registry = { address: this.options.registry, abi: REGISTRY_ABI } as const;
    const count = await this.#evm.readContract({ ...registry, functionName: "specCount" });
    return Promise.all(
      Array.from({ length: Number(count) }, async (_, i) => {
        const hash = await this.#evm.readContract({
          ...registry,
          functionName: "specHashAt",
          args: [BigInt(i)],
        });
        const record = await this.#evm.readContract({
          ...registry,
          functionName: "getSpec",
          args: [hash],
        });
        const entry: RegisteredSpec = {
          hash: hash.toLowerCase(),
          author: record.author.toLowerCase(),
          registeredAt: Number(record.registeredAt),
          spec: null,
        };
        try {
          entry.spec = await this.spec(entry.hash);
        } catch (error) {
          entry.error = String((error as Error)?.message ?? error);
        }
        return entry;
      }),
    );
  }
}
