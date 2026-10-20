import { WsProvider } from "@polkadot/rpc-provider";

/** Minimal JSON-RPC surface Potluck needs; implemented over WebSocket in Node and browsers. */
export interface RpcClient {
  send<T>(method: string, params: unknown[]): Promise<T>;
  close(): Promise<void>;
}

export interface RetryOptions {
  /** Attempts including the first one. */
  attempts: number;
  /** Base delay in ms; doubles each retry. */
  baseDelayMs: number;
  /** Per-call timeout in ms. */
  timeoutMs: number;
}

export const DEFAULT_RETRY: RetryOptions = { attempts: 4, baseDelayMs: 250, timeoutMs: 30_000 };

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms} ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wraps a client so every call gets a timeout and exponential-backoff retries. */
export function withRetry(client: RpcClient, options: RetryOptions = DEFAULT_RETRY): RpcClient {
  return {
    async send<T>(method: string, params: unknown[]): Promise<T> {
      let lastError: unknown;
      for (let attempt = 0; attempt < options.attempts; attempt++) {
        try {
          return await withTimeout(client.send<T>(method, params), options.timeoutMs, method);
        } catch (error) {
          lastError = error;
          if (attempt < options.attempts - 1) await sleep(options.baseDelayMs * 2 ** attempt);
        }
      }
      throw lastError;
    },
    close: () => client.close(),
  };
}

/** Connects a WebSocket JSON-RPC client (works in Node ≥ 22 and browsers). */
export async function connectWs(url: string, connectTimeoutMs = 20_000): Promise<RpcClient> {
  const provider = new WsProvider(url, false);
  await provider.connect();
  await withTimeout(provider.isReady, connectTimeoutMs, `connect ${url}`);
  return {
    send: <T>(method: string, params: unknown[]) => provider.send<T>(method, params),
    close: () => provider.disconnect(),
  };
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

/** Max block numbers per `chain_getBlockHash([...])` call. */
export const BLOCK_HASH_BATCH = 500;

/**
 * Resolves block hashes with batched `chain_getBlockHash([n1, n2, ...])` calls (S6: halves the
 * request count of the publisher hot loop). Throws if a block is unknown to the node.
 */
export async function getBlockHashes(
  client: RpcClient,
  blocks: readonly number[],
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i += BLOCK_HASH_BATCH) {
    const batch = blocks.slice(i, i + BLOCK_HASH_BATCH);
    const hashes = await client.send<(string | null)[]>("chain_getBlockHash", [batch]);
    hashes.forEach((hash, j) => {
      if (!hash) throw new Error(`unknown block #${batch[j]}`);
      out.push(hash);
    });
  }
  return out;
}

export async function getFinalizedHead(
  client: RpcClient,
): Promise<{ number: number; hash: string }> {
  const hash = await client.send<string>("chain_getFinalizedHead", []);
  const header = await client.send<{ number: string }>("chain_getHeader", [hash]);
  return { number: Number.parseInt(header.number, 16), hash };
}

export async function getGenesisHash(client: RpcClient): Promise<string> {
  return client.send<string>("chain_getBlockHash", [0]);
}
