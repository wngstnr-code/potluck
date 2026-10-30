import { decodeAddress } from "@polkadot/util-crypto";
import type { RpcClient } from "@potluck/core";
import { bytesToHex } from "viem";
import { reviveAccountIdOf, reviveAddressOf } from "./history.js";

/** One address in the forms it was given: lower-case hex AccountId32 and/or H160. */
export interface AccountInput {
  id32?: string;
  h160?: string;
}

/**
 * Parses SS58 (any network prefix), a 0x 32-byte AccountId or a 0x 20-byte H160 into lower-case
 * hex. Throws on anything else.
 */
export function parseAccount(input: string): AccountInput {
  const value = input.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return { id32: value.toLowerCase() };
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return { h160: value.toLowerCase() };
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeAddress(value);
  } catch {
    // reported below
  }
  // decodeAddress also accepts short hex, so the length is checked here.
  if (bytes?.length !== 32) {
    throw new Error(`not an address: ${input} (use SS58, a 0x AccountId32 or a 0x H160)`);
  }
  return { id32: bytesToHex(bytes) };
}

/**
 * Turns an address into the account ids a spec's rows may carry, AccountId32 first (the one
 * reconciled against balances). On chains with pallet-revive the other form comes from the
 * runtime (`ReviveApi`), never from a local rule, which is wrong for `map_account` accounts.
 * Without Revive an AccountId32 stands alone, and an H160 cannot be resolved.
 */
export async function resolveAccount(source: RpcClient, input: string): Promise<string[]> {
  const { id32, h160 } = parseAccount(input);
  if (id32) {
    try {
      return [id32, await reviveAddressOf(source, id32)];
    } catch {
      return [id32];
    }
  }
  try {
    return [await reviveAccountIdOf(source, h160 as string), h160 as string];
  } catch (error) {
    throw new Error(`cannot resolve H160 ${h160}: the chain has no ReviveApi (${error})`);
  }
}
