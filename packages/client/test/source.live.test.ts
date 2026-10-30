import { connectWs, type RpcClient, withRetry } from "@potluck/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PORTALDOT_TESTNET } from "../src/networks.js";
import { PortaldotSource } from "../src/source.js";

const LIVE = process.env.POTLUCK_LIVE === "1";

describe.skipIf(!LIVE)("spec discovery on Portaldot V3 testnet", () => {
  let portaldot: RpcClient;
  let source: PortaldotSource;
  beforeAll(async () => {
    portaldot = withRetry(await connectWs(PORTALDOT_TESTNET.portaldot.ws));
    source = new PortaldotSource({
      portaldot,
      evmRpcUrl: PORTALDOT_TESTNET.portaldot.evmRpc,
      registry: PORTALDOT_TESTNET.portaldot.registry,
    });
  });
  afterAll(async () => {
    await portaldot?.close();
  });

  it("lists every preset spec from the registry, fetched and hash-checked", async () => {
    const specs = await source.specs();
    for (const [name, hash] of Object.entries(PORTALDOT_TESTNET.specs)) {
      const entry = specs.find((s) => s.hash === hash);
      expect(entry?.spec?.name, name).toBe(name);
      expect(entry?.author).toMatch(/^0x[0-9a-f]{40}$/);
    }
  }, 120_000);

  it("rejects a spec hash that is not stored", async () => {
    await expect(source.spec(`0x${"ab".repeat(32)}`)).rejects.toThrow("is not available");
  }, 60_000);
});
