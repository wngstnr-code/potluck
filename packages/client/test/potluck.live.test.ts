/**
 * Live tests of the createPotluck entry point against the public Portaldot V3 testnet registry.
 * Skipped unless POTLUCK_LIVE=1.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPotluck, type Potluck } from "../src/potluck.js";

const LIVE = process.env.POTLUCK_LIVE === "1";
const UNIFIED = "portaldot-v3-testnet.unified-history";
// The publisher dev account (Polkadot-prefix SS58 on purpose) and its Revive H160.
const SS58_POLKADOT = "16DgNVTLQaaPgBsGurCveFAHuMGzonxTYSGT371gg84Xv6ZW";
const ID32 = "0xe6d8a52701e893b1efb48d61e660bb36e1bfee0a16e553226b2be7244abfe601";
const H160 = "0xd00d195095e69b479e681f6ac359ce96f47eb790";
/** Last block of manifest 2 (Portaldot history #1–#129,069). */
const SNAPSHOT_END = 129_069;

describe("createPotluck", () => {
  it("rejects an unknown network before connecting", async () => {
    await expect(createPotluck({ network: "nope" as never })).rejects.toThrow("unknown network");
  });
});

describe.skipIf(!LIVE)("createPotluck on Portaldot V3 testnet", () => {
  let potluck: Potluck;
  beforeAll(async () => {
    potluck = await createPotluck();
  });
  afterAll(async () => {
    await potluck?.close();
  });

  it("resolves a preset spec by name and by hash to the same spec", async () => {
    const byName = await potluck.spec(UNIFIED);
    const byHash = await potluck.spec(potluck.network.specs[UNIFIED] as string);
    expect(byName.name).toBe(UNIFIED);
    expect(byHash).toBe(byName);
  }, 60_000);

  it("refuses spec names outside the preset", async () => {
    await expect(potluck.spec("someone-elses.history")).rejects.toThrow("unknown spec");
  });

  it("loads and verifies an account's history from the published snapshot", async () => {
    const history = await potluck.accountHistory({
      spec: UNIFIED,
      account: SS58_POLKADOT,
      toBlock: SNAPSHOT_END,
    });
    expect(history.accounts).toEqual([ID32, H160]);
    expect(history.segments.map((s) => s.mode)).toEqual(["snapshot"]);
    expect(history.rows.length).toBeGreaterThan(0);
    expect(history.verified).toBe(true);
  }, 300_000);
});
