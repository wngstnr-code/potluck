/**
 * Dry-runs the instantiation of PotluckRegistry on the live Portaldot V3 testnet runtime through
 * the `ReviveApi.instantiate` runtime API, for both the EVM bytecode (Foundry/solc) and the PVM
 * blob (resolc). No signature or funds are needed: the runtime executes the constructor against
 * current state with a funded account as origin and reports the result, weight and deposit.
 *
 * Usage: pnpm --filter @potluck/contracts build:evm && pnpm --filter @potluck/contracts build:pvm
 *        pnpm --filter @potluck/contracts dry-run
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WS = process.env.PORTALDOT_WS ?? "wss://test-node-v3.portaldot.dev";
/** Funded testnet account used only as the dry-run origin (validator stash, read-only use). */
const ORIGIN = process.env.DRY_RUN_ORIGIN ?? "5F4ZyJJ8R3QHZKRLAfDXdUuVE4w3Q7uq7tCNfAtvf2XEBfYY";

function evmBytecode(): Uint8Array {
  const artifact = JSON.parse(
    readFileSync(join(root, "out/PotluckRegistry.sol/PotluckRegistry.json"), "utf8"),
  ) as { bytecode: { object: string } };
  return Buffer.from(artifact.bytecode.object.replace(/^0x/, ""), "hex");
}

function pvmBlob(): Uint8Array {
  return readFileSync(join(root, "out-pvm/PotluckRegistry.polkavm"));
}

async function dryRun(api: ApiPromise, label: string, code: Uint8Array) {
  const salt = u8aToHex(randomBytes(32));
  const reviveApi = api.call.reviveApi;
  if (!reviveApi?.instantiate) throw new Error("runtime has no ReviveApi.instantiate");
  const result = (await reviveApi.instantiate(
    ORIGIN,
    0,
    null,
    null,
    // Hex string, not Uint8Array: @polkadot/api treats a raw Uint8Array for `Bytes` as already
    // SCALE-encoded (length-prefixed), which silently truncates the code.
    { Upload: u8aToHex(code) },
    "0x",
    salt,
  )) as unknown as {
    weightRequired: { toJSON(): unknown };
    gasConsumed: { toJSON(): unknown };
    storageDeposit: { toJSON(): unknown };
    maxStorageDeposit: { toJSON(): unknown };
    result: {
      isOk: boolean;
      asOk: { addr: { toHex(): string }; result: { flags: { toJSON(): { bits: number } } } };
      asErr: { isModule: boolean; asModule: unknown; toJSON(): unknown };
    };
  };

  const ok = result.result.isOk;
  let error: string | undefined;
  if (!ok) {
    const err = result.result.asErr;
    error = JSON.stringify(err.toJSON());
    if (err.isModule) {
      const meta = api.registry.findMetaError(err.asModule as never);
      error = `${meta.section}.${meta.name}: ${meta.docs.join(" ")}`;
    }
  }
  // ReturnFlags bit 0 = REVERT.
  const reverted = ok ? (result.result.asOk.result.flags.toJSON().bits & 1) === 1 : undefined;
  const summary = {
    vm: label,
    codeBytes: code.length,
    ok: ok && reverted === false,
    reverted,
    address: ok ? result.result.asOk.addr.toHex() : undefined,
    weightRequired: result.weightRequired.toJSON(),
    gasConsumed: result.gasConsumed.toJSON(),
    storageDeposit: result.storageDeposit.toJSON(),
    maxStorageDeposit: result.maxStorageDeposit.toJSON(),
    error,
  };
  console.log(JSON.stringify(summary));
  return summary;
}

async function main(): Promise<void> {
  const api = await ApiPromise.create({ provider: new WsProvider(WS), noInitWarn: true });
  const runtime = await api.rpc.state.getRuntimeVersion();
  const results = [await dryRun(api, "evm", evmBytecode()), await dryRun(api, "pvm", pvmBlob())];
  const record = {
    spike: "S8 (partial: dry-run, no tPOT needed)",
    measuredAt: new Date().toISOString(),
    endpoint: WS,
    runtime: `${runtime.specName.toString()} ${runtime.specVersion.toNumber()}`,
    origin: ORIGIN,
    results,
  };
  const out = join(root, "..", "spikes", "results", "s8-registry-dry-run.json");
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`written ${out}`);
  await api.disconnect();
  if (!results.every((r) => r.ok)) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
