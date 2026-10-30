import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { blake2AsHex } from "@polkadot/util-crypto";
import { parseManifest } from "@potluck/core";
import { encodeFunctionData } from "viem";
import { PORTALDOT } from "./config.js";
import {
  connectPortaldot,
  contractCallTx,
  estimateCall,
  findManifestId,
  REGISTRY_ABI,
  renewTx,
  retentionPeriod,
  reviveAddress,
  signerFromSeed,
  storedContentHash,
  storedLocation,
  storeTx,
  submit,
} from "./portaldot.js";
import { formatTpot, type PublishState } from "./publish.js";

/** `chunkIndex` the registry uses for the manifest blob itself (`type(uint32).max`). */
export const MANIFEST_BLOB = 0xffff_ffff;

/** Default renewal window: about one day of 6 s blocks, so a daily run never misses an entry. */
export const DEFAULT_RENEW_WITHIN = 14_400;

export interface RenewOptions {
  dir: string;
  /** PotluckRegistry address (H160). When set, renewals are announced with `noteRenewal`. */
  registry?: string;
  /** Renew entries whose last renewable block is at most this many blocks away. */
  within: number;
  /** Store expired entries again from the local build (costs as much as the first publish). */
  restore: boolean;
  /** Estimate every transaction without submitting anything. */
  dryRun: boolean;
  /** SS58 address used for estimates when no PUBLISHER_SEED is set (dry run only). */
  fromAddress?: string;
  log: (line: string) => void;
}

export interface RenewResult {
  kept: number;
  renewed: number;
  restored: number;
  /** Entries that are gone and were not stored again: their data is no longer guaranteed. */
  expired: number;
  /** Fees paid or, in a dry run, estimated (planck). */
  fee: bigint;
}

export type RenewalAction = "keep" | "renew" | "expired";

/**
 * Decides what to do with an entry stored (or last renewed) in `block`. The pallet drops a block's
 * entries at `block + retention + 1`, so a renewal must be included by `block + retention`; the next
 * transaction lands at `head + 1` at the earliest.
 */
export function planRenewal(
  block: number,
  head: number,
  retention: number,
  within: number,
  present: boolean,
): { action: RenewalAction; lastBlock: number } {
  const lastBlock = block + retention;
  if (!present || head + 1 > lastBlock) return { action: "expired", lastBlock };
  return { action: lastBlock - head <= within ? "renew" : "keep", lastBlock };
}

interface StoredBlob {
  label: string;
  /** Which `PublishState` location this blob is: the spec, the manifest, or a chunk index. */
  key: "spec" | "manifest" | number;
  location: { block: number; index: number };
  digest: string;
  path: string;
}

async function storedBlobs(dir: string, state: PublishState): Promise<StoredBlob[]> {
  const blobs: StoredBlob[] = [];
  if (state.spec) {
    const bytes = new Uint8Array(await readFile(join(dir, "spec.json")));
    blobs.push({
      label: "spec",
      key: "spec",
      location: state.spec,
      digest: blake2AsHex(bytes, 256),
      path: join(dir, "spec.json"),
    });
  }
  const draft = parseManifest(new Uint8Array(await readFile(join(dir, "manifest.draft.json"))));
  for (const [i, chunk] of draft.chunks.entries()) {
    const location = state.chunks[i];
    if (!location) continue;
    blobs.push({
      label: `chunk ${i}`,
      key: i,
      location,
      digest: chunk.blob.digest,
      path: join(dir, "chunks", `${i}.ndjson.gz`),
    });
  }
  if (state.manifest) {
    blobs.push({
      label: "manifest",
      key: "manifest",
      location: state.manifest,
      digest: state.manifest.digest,
      path: join(dir, "manifest.json"),
    });
  }
  return blobs;
}

/**
 * Keeps a published build available: renews every TransactionStorage entry that is about to pass the
 * retention period and announces the new locations in the registry. Entries that already expired can
 * be stored again from the local build with `restore`.
 */
export async function runRenew(options: RenewOptions): Promise<RenewResult> {
  const statePath = join(options.dir, "publish-state.json");
  if (!existsSync(statePath)) throw new Error(`${options.dir} has not been published yet`);
  const state = JSON.parse(await readFile(statePath, "utf8")) as PublishState;
  const blobs = await storedBlobs(options.dir, state);

  const seed = process.env.PUBLISHER_SEED;
  if (!options.dryRun && !seed) throw new Error("PUBLISHER_SEED is not set (see .env.example)");
  const signer = seed ? signerFromSeed(seed) : undefined;
  const account = signer?.address ?? options.fromAddress;
  if (!account) throw new Error("dry run needs PUBLISHER_SEED or --from-address <ss58>");
  const live = !options.dryRun && signer !== undefined;
  const save = () =>
    live ? writeFile(statePath, JSON.stringify(state, null, 2)) : Promise.resolve();

  const api = await connectPortaldot(PORTALDOT.ws);
  try {
    const head = (await api.rpc.chain.getHeader()).number.toNumber();
    const retention = await retentionPeriod(api);
    const registry = options.registry?.toLowerCase();
    options.log(`head #${head}, retention ${retention} blocks, renewing within ${options.within}`);

    if (registry && state.published && state.manifest && state.manifestId === undefined) {
      // spec.json is canonical (publish checked it), so its digest is the spec hash.
      const specHash = blake2AsHex(
        new Uint8Array(await readFile(join(options.dir, "spec.json"))),
        256,
      );
      const publisher = await reviveAddress(api, account);
      const id = await findManifestId(
        api,
        account,
        registry,
        specHash,
        state.manifest.digest,
        publisher,
      );
      if (id !== null) {
        state.manifestId = id;
        await save();
      }
    }

    const result: RenewResult = { kept: 0, renewed: 0, restored: 0, expired: 0, fee: 0n };

    const place = (key: StoredBlob["key"], location: { block: number; index: number }) => {
      if (key === "spec") state.spec = location;
      else if (key === "manifest" && state.manifest)
        state.manifest = { ...state.manifest, ...location };
      else if (typeof key === "number") state.chunks[key] = location;
    };

    // Announce to --registry and to every registry the build was added to with `register`.
    const targets = new Map(
      Object.entries(state.registrations ?? {}).map(([r, { manifestId }]) => [r, manifestId]),
    );
    if (registry && !targets.has(registry) && state.manifestId !== undefined) {
      targets.set(registry, state.manifestId);
    }

    const announce = async (blob: StoredBlob, location: { block: number; index: number }) => {
      if (blob.key === "spec") return;
      for (const [target, manifestId] of targets) {
        const data = encodeFunctionData({
          abi: REGISTRY_ABI,
          functionName: "noteRenewal",
          args: [
            BigInt(manifestId),
            blob.key === "manifest" ? MANIFEST_BLOB : blob.key,
            location.block,
            location.index,
          ],
        });
        const estimate = await estimateCall(api, account, target, data);
        if (!estimate.ok || estimate.reverted) {
          throw new Error(`${blob.label}: noteRenewal reverted in ${target}`);
        }
        if (!live || !signer) continue;
        const inclusion = await submit(api, contractCallTx(api, target, data, estimate), signer);
        result.fee += inclusion.fee;
      }
    };

    for (const blob of blobs) {
      const onChain = await storedContentHash(api, blob.location.block, blob.location.index);
      const present = onChain === blob.digest.toLowerCase();
      if (onChain !== null && !present) {
        options.log(
          `${blob.label}: #${blob.location.block}/${blob.location.index} holds other data`,
        );
      }
      const { action, lastBlock } = planRenewal(
        blob.location.block,
        head,
        retention,
        options.within,
        present,
      );
      const where = `#${blob.location.block}/${blob.location.index}`;

      if (action === "keep") {
        result.kept++;
        options.log(`${blob.label}: ${where} ok, renewable until #${lastBlock}`);
        continue;
      }

      if (action === "renew") {
        const tx = renewTx(api, blob.location.block, blob.location.index);
        if (!live || !signer) {
          const fee = (await tx.paymentInfo(account)).partialFee.toBigInt();
          result.fee += fee;
          result.renewed++;
          options.log(
            `${blob.label}: ${where} due (until #${lastBlock}), fee ≈ ${formatTpot(fee)}`,
          );
          await announce(blob, blob.location);
          continue;
        }
        const inclusion = await submit(api, tx, signer);
        const renewed = storedLocation(inclusion, "Renewed");
        if (renewed.contentHash !== blob.digest.toLowerCase()) {
          throw new Error(
            `${blob.label}: renewed content hash ${renewed.contentHash} != ${blob.digest}`,
          );
        }
        const location = { block: renewed.block, index: renewed.index };
        result.fee += inclusion.fee;
        result.renewed++;
        place(blob.key, location);
        await save();
        options.log(`${blob.label}: renewed ${where} → #${location.block}/${location.index}`);
        await announce(blob, location);
        continue;
      }

      if (!options.restore || !existsSync(blob.path)) {
        result.expired++;
        options.log(
          `${blob.label}: ${where} EXPIRED${options.restore ? " and the local copy is missing" : "; run with --restore to store it again"}`,
        );
        continue;
      }
      const bytes = new Uint8Array(await readFile(blob.path));
      if (blake2AsHex(bytes, 256) !== blob.digest.toLowerCase()) {
        throw new Error(`${blob.label}: local copy does not match digest ${blob.digest}`);
      }
      const tx = storeTx(api, bytes);
      if (!live || !signer) {
        const fee = (await tx.paymentInfo(account)).partialFee.toBigInt();
        result.fee += fee;
        result.restored++;
        options.log(
          `${blob.label}: ${where} expired, restore ${bytes.length} B, fee ≈ ${formatTpot(fee)}`,
        );
        await announce(blob, blob.location);
        continue;
      }
      const inclusion = await submit(api, tx, signer);
      const stored = storedLocation(inclusion);
      if (stored.contentHash !== blob.digest.toLowerCase()) {
        throw new Error(
          `${blob.label}: stored content hash ${stored.contentHash} != ${blob.digest}`,
        );
      }
      const location = { block: stored.block, index: stored.index };
      result.fee += inclusion.fee;
      result.restored++;
      place(blob.key, location);
      await save();
      options.log(`${blob.label}: restored → #${location.block}/${location.index}`);
      await announce(blob, location);
    }

    options.log(
      `${options.dryRun ? "DRY RUN: " : ""}${result.kept} ok, ${result.renewed} renewed, ${result.restored} restored, ${result.expired} expired; fees ${options.dryRun ? "≈ " : ""}${formatTpot(result.fee)}`,
    );
    return result;
  } finally {
    await api.disconnect();
  }
}
