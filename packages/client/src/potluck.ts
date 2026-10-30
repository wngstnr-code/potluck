import { connectWs, type MetadataStore, type RpcClient, withRetry } from "@potluck/core";
import type { Spec } from "@potluck/spec";
import { resolveAccount } from "./accounts.js";
import { accountHistory, type HistoryOptions, type HistoryResult } from "./history.js";
import { NETWORKS, type NetworkName, type PotluckNetwork } from "./networks.js";
import { PortaldotSource, type RegisteredSpec } from "./source.js";
import { type SpecHistory, type SpecHistoryOptions, specHistory } from "./spec-history.js";
import { type FollowOptions, followHistory } from "./tail.js";

/** A spec by preset name, by 0x spec hash, or the spec itself. */
export type SpecRef = string | Spec;

export interface PotluckOptions {
  /** Preset name or a full network description (default "portaldot-testnet"). */
  network?: NetworkName | PotluckNetwork;
  /** Archive endpoints per spec `source.chain`, overriding the network's. */
  endpoints?: Record<string, string>;
  /** Shared runtime-metadata cache, so each runtime version is fetched once. */
  metadataStore?: MetadataStore;
}

export type PotluckAccountHistoryOptions = Omit<
  HistoryOptions,
  "spec" | "source" | "manifests" | "accounts"
> & {
  spec: SpecRef;
  /** SS58, 0x AccountId32 or 0x H160. */
  account: string;
  /** Use published snapshots (default true); false syncs everything directly. */
  snapshots?: boolean;
};

export type PotluckSpecHistoryOptions = Omit<
  SpecHistoryOptions,
  "spec" | "source" | "manifests"
> & {
  spec: SpecRef;
  snapshots?: boolean;
};

export type PotluckFollowOptions = Omit<FollowOptions, "spec" | "source" | "accounts"> & {
  spec: SpecRef;
  /** Only this account's rows (any address form); omit for every row of the spec. */
  account?: string;
};

export interface Potluck {
  readonly network: PotluckNetwork;
  /** Registry + TransactionStorage reader, for the lower-level functions. */
  readonly manifests: PortaldotSource;
  /** Every spec registered on the network, fetched and hash-checked. */
  specs(): Promise<RegisteredSpec[]>;
  spec(ref: SpecRef): Promise<Spec>;
  /** Archive client for a source chain (one connection per endpoint, reused). */
  source(chain: string): Promise<RpcClient>;
  /** One account's history, verified against the source chain (L1, L2, L3). */
  accountHistory(
    options: PotluckAccountHistoryOptions,
  ): Promise<HistoryResult & { accounts: string[] }>;
  /** Every row of a spec (L1 on snapshots); rows stream through `onRows`. */
  specHistory(options: PotluckSpecHistoryOptions): Promise<SpecHistory>;
  /** Follows new finalized blocks; resolves to a stop function. */
  follow(options: PotluckFollowOptions): Promise<() => void>;
  /** Closes every connection this instance opened. */
  close(): Promise<void>;
}

const SPEC_HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * One entry point for apps: network presets, connections, spec lookup and address handling
 * around the lower-level functions (`accountHistory`, `specHistory`, `followHistory`).
 * Nothing it reads is trusted: specs and manifests are hash-checked and every history is
 * verified against its source chain.
 */
export async function createPotluck(options: PotluckOptions = {}): Promise<Potluck> {
  const network =
    typeof options.network === "object"
      ? options.network
      : NETWORKS[options.network ?? "portaldot-testnet"];
  if (!network) throw new Error(`unknown network ${String(options.network)}`);

  const connections = new Map<string, Promise<RpcClient>>();
  const connect = (url: string) => {
    let client = connections.get(url);
    if (!client) {
      client = connectWs(url).then((c) => withRetry(c));
      // A failed connection is not cached, so the next call retries it.
      client.catch(() => connections.delete(url));
      connections.set(url, client);
    }
    return client;
  };

  const manifests = new PortaldotSource({
    portaldot: await connect(network.portaldot.ws),
    evmRpcUrl: network.portaldot.evmRpc,
    registries: network.portaldot.registries,
  });

  const specCache = new Map<string, Promise<Spec>>();
  const spec = async (ref: SpecRef): Promise<Spec> => {
    if (typeof ref !== "string") return ref;
    const hash = SPEC_HASH.test(ref) ? ref.toLowerCase() : network.specs[ref];
    if (!hash) {
      const known = Object.keys(network.specs).join(", ");
      throw new Error(
        `unknown spec "${ref}" on ${network.name}; known: ${known}. Pass a spec hash or a Spec.`,
      );
    }
    let cached = specCache.get(hash);
    if (!cached) {
      cached = manifests.spec(hash).catch((error) => {
        specCache.delete(hash);
        throw new Error(`spec ${ref} could not be loaded from Portaldot (${error}). Pass a Spec.`);
      });
      specCache.set(hash, cached);
    }
    return cached;
  };

  const source = (chain: string) => {
    const url = options.endpoints?.[chain] ?? network.endpoints[chain];
    if (!url) throw new Error(`no endpoint for chain ${chain}; pass it in options.endpoints`);
    return connect(url);
  };

  return {
    network,
    manifests,
    specs: () => manifests.specs(),
    spec,
    source: async (chain) => source(chain),

    async accountHistory({ spec: ref, account, snapshots = true, ...rest }) {
      const resolved = await spec(ref);
      const client = await source(resolved.source.chain);
      const accounts = await resolveAccount(client, account);
      const result = await accountHistory({
        metadataStore: options.metadataStore,
        ...rest,
        spec: resolved,
        source: client,
        manifests: snapshots ? manifests : undefined,
        accounts,
      });
      return { ...result, accounts };
    },

    async specHistory({ spec: ref, snapshots = true, ...rest }) {
      const resolved = await spec(ref);
      return specHistory({
        metadataStore: options.metadataStore,
        ...rest,
        spec: resolved,
        source: await source(resolved.source.chain),
        manifests: snapshots ? manifests : undefined,
      });
    },

    async follow({ spec: ref, account, ...rest }) {
      const resolved = await spec(ref);
      const client = await source(resolved.source.chain);
      return followHistory({
        metadataStore: options.metadataStore,
        ...rest,
        spec: resolved,
        source: client,
        accounts: account ? await resolveAccount(client, account) : [],
      });
    },

    async close() {
      const clients = await Promise.allSettled(connections.values());
      connections.clear();
      await Promise.all(
        clients.map((c) => (c.status === "fulfilled" ? c.value.close() : undefined)),
      );
    },
  };
}
