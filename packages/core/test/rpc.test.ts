import { describe, expect, it } from "vitest";
import {
  getBlockHashes,
  isRetryable,
  mapPool,
  type RpcClient,
  withRetry,
  withTimeout,
} from "../src/rpc.js";

/** In-memory transport that records calls; used to test client-side batching and retry logic. */
function recordingClient(handler: (method: string, params: unknown[]) => unknown): RpcClient & {
  calls: { method: string; params: unknown[] }[];
} {
  const calls: { method: string; params: unknown[] }[] = [];
  return {
    calls,
    async send<T>(method: string, params: unknown[]): Promise<T> {
      calls.push({ method, params });
      return handler(method, params) as T;
    },
    async close() {},
  };
}

describe("getBlockHashes", () => {
  it("batches block numbers 500 per call and preserves order", async () => {
    const client = recordingClient((_, params) =>
      (params[0] as number[]).map((n) => `0x${n.toString(16).padStart(64, "0")}`),
    );
    const blocks = Array.from({ length: 1201 }, (_, i) => 1000 + i);
    const hashes = await getBlockHashes(client, blocks);
    expect(client.calls.map((c) => (c.params[0] as number[]).length)).toEqual([500, 500, 201]);
    expect(hashes).toHaveLength(1201);
    expect(hashes[0]).toBe(`0x${(1000).toString(16).padStart(64, "0")}`);
    expect(hashes[1200]).toBe(`0x${(2200).toString(16).padStart(64, "0")}`);
  });

  it("throws on unknown blocks", async () => {
    const client = recordingClient(() => ["0xaa", null]);
    await expect(getBlockHashes(client, [1, 2])).rejects.toThrow("unknown block #2");
  });
});

describe("withRetry", () => {
  it("retries with backoff and succeeds", async () => {
    let failures = 2;
    const client = recordingClient(() => {
      if (failures-- > 0) throw new Error("flaky");
      return "ok";
    });
    const result = await withRetry(client, { attempts: 4, baseDelayMs: 1, timeoutMs: 1000 }).send(
      "m",
      [],
    );
    expect(result).toBe("ok");
    expect(client.calls).toHaveLength(3);
  });

  it("gives up after the configured attempts", async () => {
    const client = recordingClient(() => {
      throw new Error("down");
    });
    await expect(
      withRetry(client, { attempts: 3, baseDelayMs: 1, timeoutMs: 1000 }).send("m", []),
    ).rejects.toThrow("down");
    expect(client.calls).toHaveLength(3);
  });
});

describe("withTimeout", () => {
  it("rejects slow promises", async () => {
    await expect(withTimeout(new Promise(() => {}), 5, "slow")).rejects.toThrow(
      "timeout after 5 ms: slow",
    );
  });
});

describe("mapPool", () => {
  it("bounds concurrency and preserves order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapPool([5, 1, 4, 2, 3], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});

describe("isRetryable", () => {
  it("retries transport errors but not JSON-RPC error responses", async () => {
    expect(isRetryable(new Error("WebSocket is not connected"))).toBe(true);
    expect(isRetryable(new Error("timeout after 30000 ms: state_getStorage"))).toBe(true);
    expect(
      isRetryable(new Error('RpcError: -32810: Transaction not found: {"variant":"NotFound"}')),
    ).toBe(false);
    expect(isRetryable(new Error("4003: RPC call is unsafe to be called externally"))).toBe(false);
    const client = recordingClient(() => {
      throw new Error("-32602: Invalid params");
    });
    await expect(
      withRetry(client, { attempts: 5, baseDelayMs: 1, timeoutMs: 1000 }).send("m", []),
    ).rejects.toThrow("Invalid params");
    expect(client.calls).toHaveLength(1);
  });
});
