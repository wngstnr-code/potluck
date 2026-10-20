import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildChunk,
  buildManifest,
  buildRuntimeMap,
  ChunkAccumulator,
  type ChunkPlan,
  compileSpec,
  connectWs,
  decodeEvents,
  eventsToRows,
  getBlockHashes,
  getFinalizedHead,
  getGenesisHash,
  type ManifestChunk,
  manifestBytes,
  manifestChunk,
  manifestDigest,
  RuntimeLoader,
  scanRawEvents,
  withRetry,
} from "@potluck/core";
import { canonicalSpecBytes, parseSpec, type Spec, specHash } from "@potluck/spec";
import { KNOWN_ENDPOINTS, TOOL } from "./config.js";
import { FileMetadataStore } from "./metadata-store.js";

export interface BuildOptions {
  specPath: string;
  /** Output root (default "builds"). */
  out: string;
  endpoint?: string;
  fromBlock?: number;
  toBlock?: number;
  /** Build only the newest N blocks (progressive backfill). */
  last?: number;
  /** In-flight RPC requests for per-block scanning. */
  concurrency: number;
  /** Blocks fetched and processed per segment. */
  segment: number;
  /**
   * Scan strategy (default "auto"). "auto" uses state_queryStorage where the node allows it; "per-block" is faster
   * on nodes that answer it slowly (Kusama AH: 63 blocks/s via queryStorage).
   */
  strategy?: "auto" | "per-block";
  log: (line: string) => void;
}

interface BuildState {
  spec: string;
  fromBlock: number;
  toBlock: number;
  /** Next block to process; everything before it is in closed chunks. */
  nextBlock: number;
  chunks: ManifestChunk[];
}

export interface BuildResult {
  dir: string;
  manifestPath: string;
  digest: `0x${string}`;
  chunks: number;
  rows: number;
  seconds: number;
}

export async function loadSpec(path: string): Promise<Spec> {
  return parseSpec(JSON.parse(await readFile(path, "utf8")));
}

export function buildDir(out: string, spec: Spec, fromBlock: number, toBlock: number): string {
  return join(out, spec.name, `${fromBlock}-${toBlock}`);
}

export async function runBuild(options: BuildOptions): Promise<BuildResult> {
  const started = performance.now();
  const spec = await loadSpec(options.specPath);
  const hash = specHash(spec);
  const endpoint = options.endpoint ?? KNOWN_ENDPOINTS[spec.source.chain];
  if (!endpoint) throw new Error(`no endpoint for chain "${spec.source.chain}"; pass --endpoint`);
  const client = withRetry(await connectWs(endpoint));
  try {
    const genesis = await getGenesisHash(client);
    if (genesis.toLowerCase() !== spec.source.genesisHash) {
      throw new Error(`endpoint genesis ${genesis} does not match spec ${spec.source.genesisHash}`);
    }
    const head = await getFinalizedHead(client);
    const toBlock = Math.min(options.toBlock ?? head.number, head.number);
    let fromBlock = options.fromBlock ?? spec.source.fromBlock;
    if (options.last !== undefined) fromBlock = Math.max(fromBlock, toBlock - options.last + 1);
    if (fromBlock < spec.source.fromBlock)
      throw new Error(`from #${fromBlock} precedes the spec's fromBlock`);
    if (fromBlock > toBlock) throw new Error(`empty range #${fromBlock}..#${toBlock}`);

    const dir = buildDir(options.out, spec, fromBlock, toBlock);
    const chunksDir = join(dir, "chunks");
    await mkdir(chunksDir, { recursive: true });
    const statePath = join(dir, "state.json");
    let state: BuildState = { spec: hash, fromBlock, toBlock, nextBlock: fromBlock, chunks: [] };
    if (existsSync(statePath)) {
      const saved = JSON.parse(await readFile(statePath, "utf8")) as BuildState;
      if (saved.spec === hash && saved.fromBlock === fromBlock && saved.toBlock === toBlock) {
        state = saved;
        options.log(`resuming at #${state.nextBlock} with ${state.chunks.length} closed chunk(s)`);
      }
    }
    await writeFile(join(dir, "spec.json"), canonicalSpecBytes(spec));
    options.log(`spec ${spec.name} (${hash})`);
    options.log(`source ${spec.source.chain} via ${endpoint}, blocks #${fromBlock}..#${toBlock}`);

    const knownHashes = new Map<number, string>();
    const hashOf = async (block: number) =>
      knownHashes.get(block) ?? ((await getBlockHashes(client, [block]))[0] as string);
    const map = await buildRuntimeMap(client, state.nextBlock, toBlock, { hashOf, samples: 64 });
    options.log(
      `runtime versions: ${[...new Set(map.segments.map((s) => s.specVersion))].join(", ")}`,
    );
    const loader = new RuntimeLoader(
      client,
      new FileMetadataStore(join(".cache", "potluck", "metadata", genesis)),
    );
    const compiled = compileSpec(spec);
    const accumulator = new ChunkAccumulator(spec, state.nextBlock);

    const writeChunk = async (plan: ChunkPlan) => {
      const built = await buildChunk(spec, plan);
      const index = state.chunks.length;
      await writeFile(join(chunksDir, `${index}.ndjson.gz`), built.blob);
      state.chunks.push(manifestChunk(built));
      state.nextBlock = plan.toBlock + 1;
      await writeFile(statePath, JSON.stringify(state, null, 2));
      options.log(
        `chunk ${index}: #${plan.fromBlock}..#${plan.toBlock}, ${built.rows} rows, ${built.accounts} accounts, ${(built.blob.length / 1024).toFixed(1)} KiB gz`,
      );
    };

    let strategy: "auto" | "per-block" = options.strategy ?? "auto";
    let rows = state.chunks.reduce((n, c) => n + c.rows, 0);
    const total = toBlock - state.nextBlock + 1;
    let processed = 0;
    let lastReport = performance.now();
    for (let start = state.nextBlock; start <= toBlock; start += options.segment) {
      const end = Math.min(start + options.segment - 1, toBlock);
      const scan = await scanRawEvents(client, start, end, {
        concurrency: options.concurrency,
        strategy,
      });
      if (scan.strategy === "per-block") strategy = "per-block";
      for (const block of scan.blocks) knownHashes.set(block.block, block.hash);
      for (const { block, raw } of scan.blocks) {
        let blockRows: ReturnType<typeof eventsToRows> = [];
        if (raw.length > 0) {
          const runtime = await loader.load(map.executingVersion(block), await hashOf(block - 1));
          blockRows = eventsToRows(compiled, decodeEvents(runtime, block, raw));
        }
        rows += blockRows.length;
        for (const plan of accumulator.push(block, blockRows)) await writeChunk(plan);
      }
      for (let b = start - 1; b < end - 1; b++) knownHashes.delete(b); // keep memory bounded
      processed += end - start + 1;
      if (performance.now() - lastReport > 5000 || end === toBlock) {
        const seconds = (performance.now() - started) / 1000;
        const rate = processed / seconds;
        options.log(
          `#${end} (${((processed / total) * 100).toFixed(1)}%), ${rate.toFixed(0)} blocks/s, ${rows} rows, ETA ${((total - processed) / rate / 60).toFixed(1)} min [${scan.strategy}]`,
        );
        lastReport = performance.now();
      }
    }
    await writeChunk(accumulator.finish(toBlock));

    const toBlockHash = await hashOf(toBlock);
    const manifest = buildManifest({
      spec,
      range: { fromBlock, toBlock, toBlockHash },
      chunks: state.chunks,
      tool: TOOL,
    });
    const manifestPath = join(dir, "manifest.draft.json");
    await writeFile(manifestPath, manifestBytes(manifest));
    const digest = manifestDigest(manifest);
    const seconds = (performance.now() - started) / 1000;
    options.log(`done: ${state.chunks.length} chunk(s), ${rows} rows in ${seconds.toFixed(1)} s`);
    options.log(
      `draft manifest ${manifestPath} (digest ${digest}, chunksRoot ${manifest.chunksRoot})`,
    );
    return { dir, manifestPath, digest, chunks: state.chunks.length, rows, seconds };
  } finally {
    await client.close();
  }
}
