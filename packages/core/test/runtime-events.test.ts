import { describe, expect, it } from "vitest";
import { decodeEvents } from "../src/events.js";
import type { RpcClient } from "../src/rpc.js";
import {
  buildRuntimeMap,
  decodeCompactU32,
  LAST_RUNTIME_UPGRADE_KEY,
  RuntimeLoader,
  RuntimeMap,
} from "../src/runtime.js";
import { fixtureBlock, metadataBytes, polkadotAh, runtime } from "./fixtures.js";

const UPGRADE = 16_946_479; // Polkadot AH block that applied the 2002001 → 2003000 upgrade
const RECENT = polkadotAh.blocks.at(-1) as (typeof polkadotAh.blocks)[number];

describe("RuntimeMap", () => {
  const map = new RuntimeMap([
    { fromBlock: UPGRADE, specVersion: 2003000 },
    { fromBlock: 11_405_258, specVersion: 2002001 },
  ]);

  it("resolves post-state and executing versions around an upgrade", () => {
    expect(map.postStateVersion(UPGRADE - 1)).toBe(2002001);
    expect(map.postStateVersion(UPGRADE)).toBe(2003000);
    expect(map.executingVersion(UPGRADE)).toBe(2002001);
    expect(map.executingVersion(UPGRADE + 1)).toBe(2003000);
    expect(map.upgradeBlocks).toEqual([UPGRADE]);
  });

  it("rejects blocks before the map", () => {
    expect(() => map.postStateVersion(5)).toThrow("precedes the runtime map");
  });
});

describe("decodeEvents on real Polkadot AH blocks", () => {
  it("decodes the upgrade block with the EXECUTING (parent) runtime", () => {
    const block = fixtureBlock(UPGRADE);
    expect(block.postStateSpec).toBe(2003000);
    const events = decodeEvents(runtime(2002001), UPGRADE, `0x${block.eventsHex}`);
    expect(events.length).toBe(34);
    const names = events.map((e) => `${e.pallet}.${e.event}`);
    expect(names).toContain("System.CodeUpdated");
    expect(names).toContain("ParachainSystem.ValidationFunctionApplied");
  });

  it("refuses to decode the upgrade block with its POST-STATE runtime", () => {
    const block = fixtureBlock(UPGRADE);
    expect(() => decodeEvents(runtime(2003000), UPGRADE, `0x${block.eventsHex}`)).toThrow();
  });

  it("decodes the blocks around the upgrade", () => {
    const before = fixtureBlock(UPGRADE - 1);
    const after = fixtureBlock(UPGRADE + 1);
    expect(
      decodeEvents(runtime(2002001), before.number, `0x${before.eventsHex}`).length,
    ).toBeGreaterThan(0);
    expect(
      decodeEvents(runtime(2003000), after.number, `0x${after.eventsHex}`).length,
    ).toBeGreaterThan(0);
  });

  it("exposes metadata pallet names, variant names and typed fields", () => {
    const events = decodeEvents(
      runtime(RECENT.postStateSpec),
      RECENT.number,
      `0x${RECENT.eventsHex}`,
    );
    const balances = events.filter((e) => e.pallet === "Balances");
    expect(balances.length).toBeGreaterThanOrEqual(4);
    for (const e of balances) {
      expect(e.block).toBe(RECENT.number);
      expect(e.fields.length).toBeGreaterThan(0);
      for (const f of e.fields) expect(f.name).toMatch(/^[a-z_]+$/);
    }
    expect(events.map((e) => e.eventIndex)).toEqual(events.map((_, i) => i));
  });

  it("returns no events for empty storage", () => {
    expect(decodeEvents(runtime(2005000), 1, new Uint8Array())).toEqual([]);
  });
});

/** SCALE Compact<u32> in four-byte mode, as LastRuntimeUpgradeInfo stores spec_version. */
const compact = (v: number) => {
  const n = ((v << 2) | 2) >>> 0;
  return `0x${[n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
};

/**
 * Transport answering like a real node whose runtime upgrades (set_code) land at the given blocks:
 * the post-state runtime version changes at `at`, and System.LastRuntimeUpgrade records the new
 * version one block later, when it first executes a block. `lastRuntimeUpgrade: false` models a
 * chain without that value.
 */
function upgradingChain(
  upgrades: { at: number; spec: number }[],
  initial: number,
  options: { lastRuntimeUpgrade?: boolean } = {},
): RpcClient & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const postState = (block: number) => {
    let spec = initial;
    for (const u of upgrades) if (block >= u.at) spec = u.spec;
    return spec;
  };
  return {
    calls,
    async send<T>(method: string, params: unknown[]): Promise<T> {
      calls[method] = (calls[method] ?? 0) + 1;
      const block = Number.parseInt(String(params.at(-1)).slice(2), 16);
      if (method === "state_getRuntimeVersion") {
        return { specName: "asset-hub-polkadot", specVersion: postState(block) } as T;
      }
      if (method === "state_getStorage" && params[0] === LAST_RUNTIME_UPGRADE_KEY) {
        if (options.lastRuntimeUpgrade === false) return null as T;
        return compact(block === 0 ? postState(0) : postState(block - 1)) as T;
      }
      throw new Error(`unexpected ${method}`);
    },
    async close() {},
  };
}

describe("buildRuntimeMap", () => {
  const hashOf = async (block: number) => `0x${block.toString(16)}`;

  it("locates the real 2002001 → 2003000 boundary exactly", async () => {
    const client = upgradingChain([{ at: UPGRADE, spec: 2003000 }], 2002001);
    const map = await buildRuntimeMap(client, 16_000_000, 17_000_000, { hashOf, samples: 16 });
    expect(map.upgradeBlocks).toEqual([UPGRADE]);
    expect(map.executingVersion(UPGRADE)).toBe(2002001);
  });

  it("finds several upgrades hidden between two samples", async () => {
    const client = upgradingChain(
      [
        { at: 16_946_479, spec: 2003000 },
        { at: 16_946_600, spec: 2003001 },
        { at: 16_946_601, spec: 2003002 },
      ],
      2002001,
    );
    const map = await buildRuntimeMap(client, 16_000_000, 17_000_000, { hashOf, samples: 4 });
    expect(map.upgradeBlocks).toEqual([16_946_479, 16_946_600, 16_946_601]);
    expect(map.postStateVersion(17_000_000)).toBe(2003002);
  });

  it("returns a single segment when there is no upgrade", async () => {
    const client = upgradingChain([], 2005000);
    const map = await buildRuntimeMap(client, 22_000_000, 22_050_000, { hashOf });
    expect(map.segments).toEqual([{ fromBlock: 21_999_998, specVersion: 2005000 }]);
    expect(map.executingVersion(21_999_999)).toBe(2005000);
  });

  it("reads LastRuntimeUpgrade instead of executing the runtime (one runtime call, for the last block)", async () => {
    const client = upgradingChain([{ at: UPGRADE, spec: 2003000 }], 2002001);
    const map = await buildRuntimeMap(client, 16_000_000, 17_000_000, { hashOf, samples: 16 });
    expect(map.upgradeBlocks).toEqual([UPGRADE]);
    expect(client.calls.state_getRuntimeVersion).toBe(1);
  });

  it("falls back to state_getRuntimeVersion on chains without LastRuntimeUpgrade", async () => {
    const client = upgradingChain([{ at: UPGRADE, spec: 2003000 }], 2002001, {
      lastRuntimeUpgrade: false,
    });
    const map = await buildRuntimeMap(client, 16_000_000, 17_000_000, { hashOf, samples: 16 });
    expect(map.upgradeBlocks).toEqual([UPGRADE]);
    expect(map.executingVersion(UPGRADE + 1)).toBe(2003000);
  });
});

describe("RuntimeLoader", () => {
  it("fetches metadata once per spec version and checks the version", async () => {
    let metadataCalls = 0;
    const client: RpcClient = {
      async send<T>(method: string, params: unknown[]): Promise<T> {
        if (method === "state_getRuntimeVersion") {
          return { specName: "x", specVersion: params[0] === "0xok" ? 2005000 : 2003000 } as T;
        }
        if (method === "state_getMetadata") {
          metadataCalls++;
          return `0x${Buffer.from(metadataBytes(2005000)).toString("hex")}` as T;
        }
        throw new Error(method);
      },
      async close() {},
    };
    const loader = new RuntimeLoader(client);
    const a = await loader.load(2005000, "0xok");
    const b = await loader.load(2005000, "0xok");
    expect(a).toBe(b);
    expect(metadataCalls).toBe(1);
    expect(a.palletNames.get(10)).toBe("Balances");
    await expect(new RuntimeLoader(client).load(2005000, "0xwrong")).rejects.toThrow(
      "expected 2005000",
    );
  });
});

describe("decodeCompactU32", () => {
  it("decodes every Compact mode", () => {
    expect(decodeCompactU32("0x04")).toBe(1); // single byte
    expect(decodeCompactU32("0x1501")).toBe(69); // two bytes
    expect(decodeCompactU32("0xf2b4d20b")).toBe(49_589_564); // four bytes
    expect(decodeCompactU32("0x03ffffffff")).toBe(4_294_967_295); // big-integer mode
  });
});
