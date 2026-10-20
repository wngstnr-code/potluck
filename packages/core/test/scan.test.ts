import { describe, expect, it } from "vitest";
import { SYSTEM_EVENTS_KEY, scanRawEvents } from "../src/events.js";
import type { RpcClient } from "../src/rpc.js";
import { RuntimeMap } from "../src/runtime.js";

/**
 * Simulates a node's storage semantics: `values[n]` is the System.Events value after block n
 * (null = empty). `state_queryStorage` reports a block only when its value differs from the
 * previous block's, exactly like Substrate, plus the first block of the range.
 */
function chain(values: (string | null)[], refuseQueryStorage = false) {
  const calls: string[] = [];
  const hashOf = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
  const numberOf = (hash: string) => Number.parseInt(hash.slice(2), 16);
  const client: RpcClient = {
    async send<T>(method: string, params: unknown[]): Promise<T> {
      calls.push(method);
      switch (method) {
        case "chain_getBlockHash":
          return (params[0] as number[]).map(hashOf) as T;
        case "state_getStorage":
          return (values[numberOf(params[1] as string)] ?? null) as T;
        case "state_queryStorage": {
          if (refuseQueryStorage) throw new Error("RPC call is unsafe to be called externally");
          const from = numberOf(params[1] as string);
          const to = numberOf(params[2] as string);
          const out = [];
          for (let n = from; n <= to; n++) {
            if (n === from || values[n] !== values[n - 1]) {
              out.push({ block: hashOf(n), changes: [[SYSTEM_EVENTS_KEY, values[n] ?? null]] });
            }
          }
          return out as T;
        }
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
    async close() {},
  };
  return { client, calls };
}

const hex = (b: Uint8Array) => (b.length === 0 ? null : `0x${Buffer.from(b).toString("hex")}`);

describe("scanRawEvents", () => {
  // Repeated identical values and empty runs are exactly what queryStorage omits.
  const values = [null, "0xaa", "0xaa", "0xaa", null, null, "0xbb", "0xbb", "0xcc", null, "0xcc"];

  it("reconstructs every block exactly from change sets, across windows", async () => {
    const { client, calls } = chain(values);
    const result = await scanRawEvents(client, 1, 10, { window: 3 });
    expect(result.strategy).toBe("query-storage");
    expect(result.blocks.map((b) => b.block)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.blocks.map((b) => hex(b.raw))).toEqual(values.slice(1));
    expect(calls.filter((c) => c === "state_getStorage")).toEqual([]);
  });

  it("matches a per-block scan", async () => {
    const fast = await scanRawEvents(chain(values).client, 0, 10, { window: 4 });
    const slow = await scanRawEvents(chain(values).client, 0, 10, { strategy: "per-block" });
    expect(slow.strategy).toBe("per-block");
    expect(fast.blocks).toEqual(slow.blocks);
  });

  it("falls back to per-block reads when the node refuses state_queryStorage", async () => {
    const { client } = chain(values, true);
    const progress: number[] = [];
    const result = await scanRawEvents(client, 2, 9, { onProgress: (done) => progress.push(done) });
    expect(result.strategy).toBe("per-block");
    expect(result.blocks.map((b) => hex(b.raw))).toEqual(values.slice(2, 10));
    expect(progress.at(-1)).toBe(8);
  });
});

describe("RuntimeMap genesis", () => {
  it("decodes genesis state with the genesis runtime", () => {
    const map = new RuntimeMap([
      { fromBlock: 0, specVersion: 3000 },
      { fromBlock: 50, specVersion: 3002 },
    ]);
    expect(map.executingVersion(0)).toBe(3000);
    expect(map.executingVersion(1)).toBe(3000);
    expect(map.executingVersion(51)).toBe(3002);
  });
});
