import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiPromise, WsProvider } from "@polkadot/api";

export const ENDPOINTS = {
  portaldotTestnet: "wss://test-node-v3.portaldot.dev",
  portaldotLive: "wss://live-v3-node.portaldot.dev",
  polkadotAssetHub: "wss://polkadot-asset-hub-rpc.polkadot.io",
  kusamaAssetHub: "wss://kusama-asset-hub-rpc.polkadot.io",
} as const;

/** Polkadot Asset Hub block where pallet-revive first exists (2026-01-27T10:59:24Z). */
export const POLKADOT_AH_REVIVE_START = 11_405_259;

const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "results");

export async function connect(url: string, timeoutMs = 30_000): Promise<ApiPromise> {
  const provider = new WsProvider(url, 2_500, {}, timeoutMs);
  const api = await withTimeout(
    ApiPromise.create({ provider, noInitWarn: true, throwOnConnect: true }),
    timeoutMs,
    `connect ${url}`,
  );
  return api;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms} ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `worker` over `items` with at most `concurrency` in flight; preserves input order. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}

/** Any decorated query section, e.g. `api.query` or `(await api.at(hash)).query`. */
type QuerySection = Record<string, Record<string, unknown> | undefined>;

/** Returns a storage query function, failing loudly if the runtime does not expose it. */
export function storageQuery(
  query: unknown,
  pallet: string,
  item: string,
): ((...args: unknown[]) => Promise<unknown>) & {
  entries: (...args: unknown[]) => Promise<[unknown, unknown][]>;
  keys: (...args: unknown[]) => Promise<unknown[]>;
} {
  const fn = (query as QuerySection)[pallet]?.[item];
  if (typeof fn !== "function") throw new Error(`runtime has no storage ${pallet}.${item}`);
  return fn as never;
}

export function hasStorage(query: unknown, pallet: string, item: string): boolean {
  return typeof (query as QuerySection)[pallet]?.[item] === "function";
}

/** Reads `timestamp.now` (ms) from a decorated query section. */
export async function blockTimestamp(query: unknown): Promise<number> {
  const value = (await storageQuery(query, "timestamp", "now")()) as { toNumber(): number };
  return value.toNumber();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Writes a machine-readable result file next to the human summary in spikes/results/. */
export function writeResult(name: string, data: unknown): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const path = join(RESULTS_DIR, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

export function log(message: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}
