import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { blake2AsHex } from "@polkadot/util-crypto";
import { connectWs, getFinalizedHead, withRetry } from "@potluck/core";
import { type Spec, specHash } from "@potluck/spec";
import { loadSpec, runBuild } from "./build.js";
import { KNOWN_ENDPOINTS } from "./config.js";
import { formatTpot, type PublishState, runPublish } from "./publish.js";
import { runRenew } from "./renew.js";
import { reportsOk, runVerify } from "./verify.js";

export interface SyncOptions {
  specPath: string;
  /** Output root (default "builds"). */
  out: string;
  endpoint?: string;
  /** PotluckRegistry address (H160). Required unless --dry-run. */
  registry?: string;
  dryRun: boolean;
  fromAddress?: string;
  /** Skip building when fewer new finalized blocks than this exist (an unfinished build always resumes). */
  minBlocks: number;
  /** Abort before spending when the estimated store fees of unpublished builds exceed this (planck). */
  budget?: bigint;
  /** Check new builds (integrity + reconciliation against the source chain) before publishing. */
  verify: boolean;
  /** Renewal window and restore behaviour, as in `renew`. */
  within: number;
  restore: boolean;
  concurrency: number;
  segment: number;
  strategy?: "auto" | "per-block";
  log: (line: string) => void;
}

export interface BuildRange {
  dir: string;
  fromBlock: number;
  toBlock: number;
  /** The build finished (its draft manifest exists). */
  complete: boolean;
}

export type SyncStep =
  | { kind: "build"; fromBlock: number; toBlock: number; resume: boolean }
  | { kind: "skip"; reason: string };

/**
 * Picks the next range for a spec: resume an unfinished build that starts right after the newest
 * complete one, otherwise index everything from there to the finalized head.
 */
export function planNextRange(builds: BuildRange[], head: number, minBlocks: number): SyncStep {
  const complete = builds.filter((b) => b.complete);
  if (complete.length === 0) {
    throw new Error(
      "no complete build for this spec yet; run `potluck build` first (e.g. --last N)",
    );
  }
  const tip = Math.max(...complete.map((b) => b.toBlock));
  const unfinished = builds.find((b) => !b.complete && b.fromBlock === tip + 1);
  if (unfinished) {
    return {
      kind: "build",
      fromBlock: unfinished.fromBlock,
      toBlock: unfinished.toBlock,
      resume: true,
    };
  }
  const fresh = head - tip;
  if (fresh < Math.max(1, minBlocks)) {
    return {
      kind: "skip",
      reason: `${Math.max(0, fresh)} new block(s) since #${tip}, below ${minBlocks}`,
    };
  }
  return { kind: "build", fromBlock: tip + 1, toBlock: head, resume: false };
}

/** Builds of this exact spec under `<out>/<spec name>/<from>-<to>`, oldest first. */
export async function listBuilds(out: string, spec: Spec): Promise<BuildRange[]> {
  const root = join(out, spec.name);
  if (!existsSync(root)) return [];
  const hash = specHash(spec);
  const builds: BuildRange[] = [];
  for (const name of await readdir(root)) {
    const match = /^(\d+)-(\d+)$/.exec(name);
    if (!match) continue;
    const dir = join(root, name);
    const specFile = join(dir, "spec.json");
    if (!existsSync(specFile)) continue;
    if (blake2AsHex(new Uint8Array(await readFile(specFile)), 256) !== hash) continue; // older spec version
    builds.push({
      dir,
      fromBlock: Number(match[1]),
      toBlock: Number(match[2]),
      complete: existsSync(join(dir, "manifest.draft.json")),
    });
  }
  return builds.sort((a, b) => a.fromBlock - b.fromBlock || a.toBlock - b.toBlock);
}

async function publishState(dir: string): Promise<PublishState | null> {
  const path = join(dir, "publish-state.json");
  return existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as PublishState) : null;
}

/**
 * One command a publisher runs periodically (by hand or from their own scheduler): index the blocks
 * finalized since the newest build, publish every build that is not on chain yet as its own manifest
 * (clients merge manifests), and renew everything that is about to expire.
 */
export async function runSync(options: SyncOptions): Promise<{ expired: number }> {
  const spec = await loadSpec(options.specPath);
  const endpoint = options.endpoint ?? KNOWN_ENDPOINTS[spec.source.chain];
  if (!endpoint) throw new Error(`no endpoint for chain "${spec.source.chain}"; pass --endpoint`);
  if (!options.dryRun && !options.registry) throw new Error("--registry <address> is required");

  // 1. Index new blocks.
  const client = withRetry(await connectWs(endpoint));
  let head: number;
  try {
    head = (await getFinalizedHead(client)).number;
  } finally {
    await client.close();
  }
  const step = planNextRange(await listBuilds(options.out, spec), head, options.minBlocks);
  if (step.kind === "skip") {
    options.log(`build: skipped (${step.reason})`);
  } else {
    options.log(
      `build: ${step.resume ? "resuming" : "indexing"} #${step.fromBlock}..#${step.toBlock}`,
    );
    const built = await runBuild({
      specPath: options.specPath,
      out: options.out,
      endpoint,
      fromBlock: step.fromBlock,
      toBlock: step.toBlock,
      concurrency: options.concurrency,
      segment: options.segment,
      strategy: options.strategy,
      log: options.log,
    });
    if (options.verify) {
      const reports = await runVerify({
        dir: built.dir,
        endpoint,
        rebuild: false,
        reconcile: true,
        concurrency: options.concurrency,
        log: options.log,
      });
      if (!reportsOk(reports))
        throw new Error(`${built.dir} failed verification; nothing published`);
    }
  }

  // 2. Publish every complete build that is not registered yet.
  const builds = (await listBuilds(options.out, spec)).filter((b) => b.complete);
  const pending: BuildRange[] = [];
  for (const build of builds) {
    if (!(await publishState(build.dir))?.published) pending.push(build);
  }
  const publish = (dir: string, dryRun: boolean) =>
    runPublish({
      dir,
      registry: options.registry,
      dryRun,
      fromAddress: options.fromAddress,
      log: options.log,
    });
  if (pending.length === 0) {
    options.log("publish: every build is already published");
  } else if (options.dryRun || options.budget !== undefined) {
    let estimate = 0n;
    for (const build of pending) estimate += (await publish(build.dir, true)).fee;
    options.log(
      `publish: ${pending.length} build(s), store fees ≈ ${formatTpot(estimate)}` +
        (options.budget !== undefined ? ` (budget ${formatTpot(options.budget)})` : ""),
    );
    if (options.budget !== undefined && estimate > options.budget) {
      throw new Error("estimated store fees exceed --budget; nothing published");
    }
  }
  if (!options.dryRun) {
    for (const build of pending) await publish(build.dir, false);
  }

  // 3. Renew what is about to expire.
  let expired = 0;
  for (const build of builds) {
    if (!(await publishState(build.dir))) continue;
    options.log(`renew: ${build.dir}`);
    const renewed = await runRenew({
      dir: build.dir,
      registry: options.registry,
      within: options.within,
      restore: options.restore,
      dryRun: options.dryRun,
      fromAddress: options.fromAddress,
      log: options.log,
    });
    expired += renewed.expired;
  }
  return { expired };
}
