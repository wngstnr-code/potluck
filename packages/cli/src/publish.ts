import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { blake2AsHex } from "@polkadot/util-crypto";
import {
  checkChunkIntegrity,
  type Manifest,
  manifestBytes,
  manifestDigest,
  parseManifest,
} from "@potluck/core";
import { parseSpec, specHash } from "@potluck/spec";
import { encodeFunctionData, type Hex, zeroAddress } from "viem";
import { PORTALDOT } from "./config.js";
import {
  connectPortaldot,
  contractCallTx,
  estimateCall,
  type ManifestInput,
  REGISTRY_ABI,
  readContract,
  reviveAddress,
  signerFromSeed,
  storedLocation,
  storeTx,
  submit,
} from "./portaldot.js";

export interface PublishOptions {
  dir: string;
  /** PotluckRegistry address (H160). Required unless --dry-run. */
  registry?: string;
  /** Estimate every transaction without submitting anything. */
  dryRun: boolean;
  /** SS58 address used for estimates when no PUBLISHER_SEED is set (dry run only). */
  fromAddress?: string;
  log: (line: string) => void;
}

interface PublishState {
  manifestDraftDigest: string;
  spec?: { block: number; index: number };
  specRegistered?: boolean;
  chunks: ({ block: number; index: number } | null)[];
  manifest?: { block: number; index: number; digest: string };
  published?: { blockHash: string };
}

const TPOT = 10n ** 14n;
const formatTpot = (planck: bigint) => `${(Number(planck) / Number(TPOT)).toFixed(4)} tPOT`;

export async function runPublish(options: PublishOptions): Promise<void> {
  const specBytes = new Uint8Array(await readFile(join(options.dir, "spec.json")));
  const spec = parseSpec(JSON.parse(new TextDecoder().decode(specBytes)));
  const hash = specHash(spec);
  if (blake2AsHex(specBytes, 256) !== hash) throw new Error("spec.json is not canonical");
  const draft = parseManifest(
    new Uint8Array(await readFile(join(options.dir, "manifest.draft.json"))),
  );
  if (draft.spec !== hash) throw new Error("draft manifest does not belong to spec.json");

  // Never spend on a broken build: check every chunk locally first (L1).
  const blobs: Uint8Array[] = [];
  for (const [i, chunk] of draft.chunks.entries()) {
    const blob = new Uint8Array(await readFile(join(options.dir, "chunks", `${i}.ndjson.gz`)));
    const { problems } = await checkChunkIntegrity(spec, chunk, blob);
    if (problems.length > 0) throw new Error(`chunk ${i} fails integrity: ${problems.join(", ")}`);
    blobs.push(blob);
  }

  const seed = process.env.PUBLISHER_SEED;
  if (!options.dryRun && !seed) throw new Error("PUBLISHER_SEED is not set (see .env.example)");
  if (!options.dryRun && !options.registry) throw new Error("--registry <address> is required");
  const signer = seed ? signerFromSeed(seed) : undefined;
  const account = signer?.address ?? options.fromAddress;
  if (!account) throw new Error("dry run needs PUBLISHER_SEED or --from-address <ss58>");

  const api = await connectPortaldot(PORTALDOT.ws);
  try {
    const publisher = await reviveAddress(api, account);
    options.log(`publisher ${account} (H160 ${publisher})`);
    const registry = options.registry?.toLowerCase();

    const statePath = join(options.dir, "publish-state.json");
    let state: PublishState = {
      manifestDraftDigest: manifestDigest(draft),
      chunks: draft.chunks.map(() => null),
    };
    if (existsSync(statePath)) {
      const saved = JSON.parse(await readFile(statePath, "utf8")) as PublishState;
      if (saved.manifestDraftDigest === state.manifestDraftDigest) state = saved;
    }
    const save = () =>
      options.dryRun ? Promise.resolve() : writeFile(statePath, JSON.stringify(state, null, 2));

    let specKnown = false;
    if (registry) {
      const onChain = await readContract<{ author: string }>(
        api,
        account,
        registry,
        REGISTRY_ABI,
        "getSpec",
        [hash],
      );
      specKnown = onChain.author !== zeroAddress;
    }

    let totalFee = 0n;
    let totalBytes = 0;
    const estimateStore = async (label: string, bytes: Uint8Array) => {
      const info = await storeTx(api, bytes).paymentInfo(account);
      totalFee += info.partialFee.toBigInt();
      totalBytes += bytes.length;
      options.log(`${label}: ${bytes.length} B, fee ≈ ${formatTpot(info.partialFee.toBigInt())}`);
    };
    const store = async (label: string, bytes: Uint8Array, digest: string) => {
      if (options.dryRun || !signer) return estimateStore(label, bytes);
      const inclusion = await submit(api, storeTx(api, bytes), signer);
      const location = storedLocation(inclusion);
      if (location.contentHash !== digest) {
        throw new Error(`${label}: stored content hash ${location.contentHash} != ${digest}`);
      }
      options.log(`${label}: stored at #${location.block} index ${location.index}`);
      return { block: location.block, index: location.index };
    };

    // 1. Spec blob + registration.
    if (!specKnown && !state.specRegistered) {
      if (!state.spec) {
        const location = await store("spec", specBytes, hash);
        if (location) state.spec = location;
        await save();
      }
      if (registry && state.spec) {
        const data = encodeFunctionData({
          abi: REGISTRY_ABI,
          functionName: "registerSpec",
          args: [hash as Hex, state.spec.block, state.spec.index],
        });
        const estimate = await estimateCall(api, account, registry, data);
        if (!estimate.ok || estimate.reverted) throw new Error("registerSpec dry run reverted");
        if (signer) {
          await submit(api, contractCallTx(api, registry, data, estimate), signer);
          state.specRegistered = true;
          await save();
          options.log("spec registered");
        }
      }
    } else {
      options.log("spec already registered");
    }

    // 2. Chunk blobs (resumable).
    for (const [i, chunk] of draft.chunks.entries()) {
      if (state.chunks[i]) continue;
      const location = await store(`chunk ${i}`, blobs[i] as Uint8Array, chunk.blob.digest);
      if (location) {
        state.chunks[i] = location;
        await save();
      }
    }

    // 3. Final manifest with blob locations and the publisher.
    const final: Manifest = {
      ...draft,
      chunks: draft.chunks.map((c, i) => ({
        ...c,
        blob: { ...c.blob, location: state.chunks[i] ?? null },
      })),
      publisher,
    };
    const finalBytes = manifestBytes(final);
    const finalDigest = manifestDigest(final);
    if (!state.manifest) {
      const location = await store("manifest", finalBytes, finalDigest);
      if (location) {
        state.manifest = { ...location, digest: finalDigest };
        await save();
        await writeFile(join(options.dir, "manifest.json"), finalBytes);
      }
    }

    // 4. Registry entry.
    if (registry && state.manifest && !state.published) {
      const input: ManifestInput = {
        specHash: hash as Hex,
        sourceGenesis: spec.source.genesisHash as Hex,
        fromBlock: BigInt(final.range.fromBlock),
        toBlock: BigInt(final.range.toBlock),
        toBlockHash: final.range.toBlockHash as Hex,
        chunksRoot: final.chunksRoot as Hex,
        manifestDigest: state.manifest.digest as Hex,
        tsBlock: state.manifest.block,
        tsIndex: state.manifest.index,
        chunkCount: final.chunks.length,
      };
      const data = encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "publish",
        args: [input],
      });
      const estimate = await estimateCall(api, account, registry, data);
      if (!estimate.ok || estimate.reverted) throw new Error("publish dry run reverted");
      if (signer && !options.dryRun) {
        const inclusion = await submit(api, contractCallTx(api, registry, data, estimate), signer);
        state.published = { blockHash: inclusion.blockHash };
        await save();
        options.log(`manifest published in block ${inclusion.blockHash}`);
      }
    }

    if (options.dryRun) {
      options.log(
        `DRY RUN: ${totalBytes} B to store, estimated store fees ≈ ${formatTpot(totalFee)}` +
          (registry ? "" : " (registry calls not estimated: no --registry)"),
      );
    } else {
      options.log(`published ${final.chunks.length} chunk(s); manifest digest ${finalDigest}`);
    }
  } finally {
    await api.disconnect();
  }
}
