/**
 * Deploys PotluckRegistry to Portaldot V3 via `revive.instantiateWithCode`, signed by the SS58 dev
 * account in PUBLISHER_SEED, for the EVM bytecode and/or the PVM blob. Limits come from a
 * ReviveApi.instantiate dry run (+20%). Addresses and tx data are written to
 * deployments/portaldot-v3-testnet.json.
 *
 * Usage: PUBLISHER_SEED=... pnpm --filter @potluck/contracts deploy [-- --vm evm|pvm|both]
 * Needs tPOT: deposits ≈ 433 (EVM) / ≈ 3,293 (PVM) tPOT (spike S8).
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { u8aToHex } from "@polkadot/util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WS = process.env.PORTALDOT_WS ?? "wss://test-node-v3.portaldot.dev";
const vmArg = process.argv.includes("--vm") ? process.argv[process.argv.indexOf("--vm") + 1] : "both";
const VMS: string[] = vmArg === "both" || vmArg === undefined ? ["evm", "pvm"] : [vmArg];
/** keccak256("manifestCount()")[0..4] */
const MANIFEST_COUNT = "0x0f6782b2"; // `cast sig "manifestCount()"`

type Revive = {
  instantiate: (...args: unknown[]) => Promise<{
    weightRequired: { refTime: { toBigInt(): bigint }; proofSize: { toBigInt(): bigint } };
    storageDeposit: { isCharge: boolean; asCharge: { toBigInt(): bigint } };
    result: { isOk: boolean; asOk: { result: { flags: { toJSON(): { bits: number } } } } };
  }>;
  call: (...args: unknown[]) => Promise<{
    result: { isOk: boolean; asOk: { data: { toHex(): string } } };
  }>;
};

function code(vm: string): string {
  if (vm === "evm") {
    const artifact = JSON.parse(readFileSync(join(root, "out/PotluckRegistry.sol/PotluckRegistry.json"), "utf8"));
    return artifact.bytecode.object as string;
  }
  if (vm === "pvm") return u8aToHex(readFileSync(join(root, "out-pvm/PotluckRegistry.polkavm")));
  throw new Error(`unknown vm ${vm}`);
}

async function main(): Promise<void> {
  const seed = process.env.PUBLISHER_SEED;
  if (!seed) throw new Error("PUBLISHER_SEED is not set");
  const signer = new Keyring({ type: "sr25519", ss58Format: 42 }).addFromUri(seed.trim());
  const api = await ApiPromise.create({ provider: new WsProvider(WS, 1_000, {}, 120_000), noInitWarn: true });
  const revive = (api.call as unknown as { reviveApi: Revive }).reviveApi;
  const instantiateWithCode = api.tx.revive?.instantiateWithCode;
  if (!instantiateWithCode) throw new Error("runtime has no revive.instantiateWithCode");
  const runtime = await api.rpc.state.getRuntimeVersion();
  const outPath = join(root, "deployments", "portaldot-v3-testnet.json");
  const deployments: Record<string, unknown> = {};
  try {
    Object.assign(deployments, JSON.parse(readFileSync(outPath, "utf8")));
  } catch {
    // first deployment
  }

  for (const vm of VMS) {
    const bytecode = code(vm);
    const salt = u8aToHex(randomBytes(32));
    const dry = await revive.instantiate(signer.address, 0, null, null, { Upload: bytecode }, "0x", salt);
    if (!dry.result.isOk || (dry.result.asOk.result.flags.toJSON().bits & 1) === 1) {
      throw new Error(`${vm}: dry run failed`);
    }
    const pad = (n: bigint) => (n * 12n) / 10n + 1n;
    const deposit = dry.storageDeposit.isCharge ? dry.storageDeposit.asCharge.toBigInt() : 0n;
    console.log(`${vm}: deposit ≈ ${(Number(deposit) / 1e14).toFixed(2)} tPOT; submitting…`);
    const tx = instantiateWithCode(
      0,
      { refTime: pad(dry.weightRequired.refTime.toBigInt()), proofSize: pad(dry.weightRequired.proofSize.toBigInt()) },
      pad(deposit),
      bytecode,
      "0x",
      salt,
    );
    const inclusion = await new Promise<{ blockHash: string; txHash: string; contract: string }>((resolve, reject) => {
      tx.signAndSend(signer, (result) => {
        if (result.dispatchError) {
          const e = result.dispatchError;
          reject(new Error(e.isModule ? JSON.stringify(api.registry.findMetaError(e.asModule)) : e.toString()));
          return;
        }
        if (result.status.isInBlock) {
          const instantiated = result.events.find(
            ({ event }) => event.section === "revive" && event.method === "Instantiated",
          );
          if (!instantiated) return reject(new Error("no Revive.Instantiated event"));
          const [, contract] = instantiated.event.data.map((d) => d.toString().toLowerCase());
          resolve({ blockHash: result.status.asInBlock.toHex(), txHash: tx.hash.toHex(), contract: contract as string });
        }
      }).catch(reject);
    });
    const header = await api.rpc.chain.getHeader(inclusion.blockHash);
    const check = await revive.call(signer.address, inclusion.contract, 0, null, null, MANIFEST_COUNT);
    if (!check.result.isOk || BigInt(check.result.asOk.data.toHex()) !== 0n) {
      throw new Error(`${vm}: deployed contract does not answer manifestCount() == 0`);
    }
    deployments[vm] = {
      address: inclusion.contract,
      txHash: inclusion.txHash,
      blockHash: inclusion.blockHash,
      blockNumber: header.number.toNumber(),
      deployer: signer.address,
      codeBytes: (bytecode.length - 2) / 2,
      runtime: `${runtime.specName.toString()} ${runtime.specVersion.toNumber()}`,
      deployedAt: new Date().toISOString(),
    };
    console.log(`${vm}: ${inclusion.contract} at #${header.number.toNumber()} (tx ${inclusion.txHash})`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(deployments, null, 2)}\n`);
  console.log(`written ${outPath}`);
  await api.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
