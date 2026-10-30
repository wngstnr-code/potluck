import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { blake2AsHex } from "@polkadot/util-crypto";
import { manifestDigest, parseManifest } from "@potluck/core";
import { parseSpec, specHash } from "@potluck/spec";
import { encodeFunctionData, type Hex, zeroAddress } from "viem";
import { PORTALDOT } from "./config.js";
import {
  connectPortaldot,
  contractCallTx,
  estimateCall,
  findManifestId,
  type ManifestInput,
  REGISTRY_ABI,
  readContract,
  reviveAddress,
  signerFromSeed,
  storedContentHash,
  submit,
} from "./portaldot.js";
import { formatTpot, type PublishState } from "./publish.js";

export interface RegisterOptions {
  dir: string;
  /** PotluckRegistry address (H160) to add the published build to. */
  registry: string;
  /** Estimate every call without submitting anything. */
  dryRun: boolean;
  /** SS58 address used for estimates when no PUBLISHER_SEED is set (dry run only). */
  fromAddress?: string;
  log: (line: string) => void;
}

export interface RegisterResult {
  manifestId?: number;
  /** Transaction fees paid or, in a dry run, estimated (planck). */
  fee: bigint;
  /** Revive storage deposits charged or, in a dry run, estimated (planck). */
  deposit: bigint;
}

/**
 * Adds an already published build to another PotluckRegistry (e.g. the PVM build next to the EVM
 * one) without storing anything again: the spec and manifest entries already in TransactionStorage
 * are registered at their current locations. Idempotent; the manifest id is kept per registry in
 * `publish-state.json` so `renew` can announce renewals there too.
 */
export async function runRegister(options: RegisterOptions): Promise<RegisterResult> {
  const statePath = join(options.dir, "publish-state.json");
  if (!existsSync(statePath)) throw new Error(`${options.dir} has not been published yet`);
  const state = JSON.parse(await readFile(statePath, "utf8")) as PublishState;
  if (!state.manifest) throw new Error(`${options.dir}: publish is not complete`);
  const manifestAt = state.manifest;

  const specBytes = new Uint8Array(await readFile(join(options.dir, "spec.json")));
  const spec = parseSpec(JSON.parse(new TextDecoder().decode(specBytes)));
  const hash = specHash(spec);
  if (blake2AsHex(specBytes, 256) !== hash) throw new Error("spec.json is not canonical");
  const manifest = parseManifest(
    new Uint8Array(await readFile(join(options.dir, "manifest.json"))),
  );
  if (manifestDigest(manifest) !== manifestAt.digest) {
    throw new Error("manifest.json does not match the published manifest digest");
  }

  const seed = process.env.PUBLISHER_SEED;
  if (!options.dryRun && !seed) throw new Error("PUBLISHER_SEED is not set (see .env.example)");
  const signer = seed ? signerFromSeed(seed) : undefined;
  const account = signer?.address ?? options.fromAddress;
  if (!account) throw new Error("dry run needs PUBLISHER_SEED or --from-address <ss58>");
  const live = !options.dryRun && signer !== undefined;
  const registry = options.registry.toLowerCase();

  const api = await connectPortaldot(PORTALDOT.ws);
  try {
    // Registering data that is gone would point clients at nothing.
    const checkStored = async (
      label: string,
      at: { block: number; index: number },
      digest: string,
    ) => {
      const onChain = await storedContentHash(api, at.block, at.index);
      if (onChain !== digest.toLowerCase()) {
        throw new Error(`${label} is not stored at #${at.block}/${at.index}; run renew --restore`);
      }
    };
    await checkStored("manifest", manifestAt, manifestAt.digest);

    const publisher = await reviveAddress(api, account);
    options.log(`publisher ${account} (H160 ${publisher}), registry ${registry}`);
    const result: RegisterResult = { fee: 0n, deposit: 0n };

    const call = async (label: string, data: Hex) => {
      const estimate = await estimateCall(api, account, registry, data);
      if (!estimate.ok || estimate.reverted) throw new Error(`${label} dry run reverted`);
      const tx = contractCallTx(api, registry, data, estimate);
      result.deposit += estimate.storageDeposit;
      if (!live || !signer) {
        const fee = (await tx.paymentInfo(account)).partialFee.toBigInt();
        result.fee += fee;
        options.log(
          `${label}: fee ≈ ${formatTpot(fee)}, storage deposit ≈ ${formatTpot(estimate.storageDeposit)}`,
        );
        return false;
      }
      const inclusion = await submit(api, tx, signer);
      result.fee += inclusion.fee;
      options.log(`${label}: included in ${inclusion.blockHash}`);
      return true;
    };

    const onChainSpec = await readContract<{ author: string }>(
      api,
      account,
      registry,
      REGISTRY_ABI,
      "getSpec",
      [hash],
    );
    let specKnown = onChainSpec.author !== zeroAddress;
    if (specKnown) {
      options.log("spec already registered");
    } else {
      // A build published after its spec was registered has no spec location of its own.
      if (!state.spec)
        throw new Error("spec is not registered here and this build never stored it");
      await checkStored("spec", state.spec, hash);
      specKnown = await call(
        "registerSpec",
        encodeFunctionData({
          abi: REGISTRY_ABI,
          functionName: "registerSpec",
          args: [hash as Hex, state.spec.block, state.spec.index],
        }),
      );
    }

    let id = await findManifestId(api, account, registry, hash, manifestAt.digest, publisher);
    if (id !== null) {
      options.log(`manifest already registered as id ${id}`);
    } else if (!specKnown) {
      options.log("publish: not estimated until the spec is registered (the dry run would revert)");
    } else {
      const input: ManifestInput = {
        specHash: hash as Hex,
        sourceGenesis: spec.source.genesisHash as Hex,
        fromBlock: BigInt(manifest.range.fromBlock),
        toBlock: BigInt(manifest.range.toBlock),
        toBlockHash: manifest.range.toBlockHash as Hex,
        chunksRoot: manifest.chunksRoot as Hex,
        manifestDigest: manifestAt.digest as Hex,
        tsBlock: manifestAt.block,
        tsIndex: manifestAt.index,
        chunkCount: manifest.chunks.length,
      };
      const done = await call(
        "publish",
        encodeFunctionData({ abi: REGISTRY_ABI, functionName: "publish", args: [input] }),
      );
      if (done) {
        id = await findManifestId(api, account, registry, hash, manifestAt.digest, publisher);
      }
    }

    if (id !== null) {
      result.manifestId = id;
      if (live && state.registrations?.[registry]?.manifestId !== id) {
        state.registrations = { ...state.registrations, [registry]: { manifestId: id } };
        await writeFile(statePath, JSON.stringify(state, null, 2));
      }
      options.log(`registry manifest id ${id}`);
    }
    options.log(
      `${live ? "" : "DRY RUN: "}fees ${formatTpot(result.fee)}, storage deposits ${formatTpot(result.deposit)}`,
    );
    return result;
  } finally {
    await api.disconnect();
  }
}
