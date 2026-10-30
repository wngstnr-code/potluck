import type { RpcClient } from "@potluck/core";
import { describe, expect, it } from "vitest";
import { parseAccount, resolveAccount } from "../src/accounts.js";

// The publisher dev account on Portaldot V3 testnet and its Revive H160, as returned by
// ReviveApi_address / ReviveApi_account_id on the live node (docs/DEVELOPMENT.md §1).
const SS58_PORTALDOT = "5HHPEACGYoJvEerkxD9vW6L93jHM7VQKTwXxsp2L8331jfmM";
const SS58_POLKADOT = "16DgNVTLQaaPgBsGurCveFAHuMGzonxTYSGT371gg84Xv6ZW";
const ID32 = "0xe6d8a52701e893b1efb48d61e660bb36e1bfee0a16e553226b2be7244abfe601";
const H160 = "0xd00d195095e69b479e681f6ac359ce96f47eb790";

/** Replays the recorded runtime-API answers for the dev account; anything else fails like a chain without Revive. */
function recordedRevive(): RpcClient {
  return {
    async send<T>(method: string, params: unknown[]): Promise<T> {
      if (method === "state_call" && params[0] === "ReviveApi_address" && params[1] === ID32)
        return H160 as T;
      if (method === "state_call" && params[0] === "ReviveApi_account_id" && params[1] === H160)
        return ID32 as T;
      throw new Error("-32000: Client error: Exported method is not found");
    },
    close: async () => {},
  };
}

const noRevive: RpcClient = {
  send: async () => {
    throw new Error("-32000: Client error: Exported method ReviveApi_address is not found");
  },
  close: async () => {},
};

describe("parseAccount", () => {
  it("decodes SS58 regardless of the network prefix", () => {
    expect(parseAccount(SS58_PORTALDOT)).toEqual({ id32: ID32 });
    expect(parseAccount(SS58_POLKADOT)).toEqual({ id32: ID32 });
  });

  it("lower-cases hex AccountId32 and H160", () => {
    expect(parseAccount(` ${ID32.toUpperCase().replace("0X", "0x")} `)).toEqual({ id32: ID32 });
    expect(parseAccount(H160.toUpperCase().replace("0X", "0x"))).toEqual({ h160: H160 });
  });

  it("rejects anything else", () => {
    expect(() => parseAccount("0x1234")).toThrow("not an address");
    expect(() => parseAccount("alice")).toThrow("not an address");
  });
});

describe("resolveAccount", () => {
  it("adds the Revive H160 to an AccountId32, AccountId32 first", async () => {
    expect(await resolveAccount(recordedRevive(), SS58_PORTALDOT)).toEqual([ID32, H160]);
  });

  it("adds the AccountId32 to an H160, AccountId32 first", async () => {
    expect(await resolveAccount(recordedRevive(), H160)).toEqual([ID32, H160]);
  });

  it("keeps a lone AccountId32 on a chain without Revive", async () => {
    expect(await resolveAccount(noRevive, ID32)).toEqual([ID32]);
  });

  it("cannot resolve an H160 without Revive", async () => {
    await expect(resolveAccount(noRevive, H160)).rejects.toThrow("no ReviveApi");
  });
});
