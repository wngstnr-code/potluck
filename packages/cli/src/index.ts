#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runBuild } from "./build.js";
import { runPublish } from "./publish.js";
import { runTamper } from "./tamper.js";
import { reportsOk, runVerify } from "./verify.js";

const USAGE = `potluck <command> [options]

Commands:
  build <spec.json>   Index a spec's range into chunks and a draft manifest (resumable)
    --endpoint <wss>    Source chain RPC (default: known endpoint for the spec's chain)
    --from <n>          First block (default: spec fromBlock)
    --to <n>            Last block (default: finalized head)
    --last <n>          Only the newest n blocks (progressive backfill)
    --out <dir>         Output root (default: builds)
    --concurrency <n>   In-flight requests when scanning per block (default: 64)
    --segment <n>       Blocks per processing segment (default: 2000)
    --strategy <s>      auto (state_queryStorage when allowed) or per-block (default: auto)

  verify <build-dir>  Check a build's chunks: integrity (L1), optional re-index and reconciliation (L3)
    --endpoint <wss>    Source chain RPC (default: known endpoint for the spec's chain)
    --chunks <i,j,..>   Only these chunk indexes (default: all)
    --rebuild           Re-index each chunk range from the source chain and compare raw hashes
    --no-reconcile      Skip reconciliation against source-chain state
    --concurrency <n>   In-flight requests (default: 32)

  publish <build-dir> Store spec, chunks and manifest in Portaldot TransactionStorage and register them
    --registry <h160>   PotluckRegistry address (required unless --dry-run)
    --dry-run           Build every transaction and estimate fees without submitting
    --from-address <ss58>  Account for estimates when PUBLISHER_SEED is not set
  Env: PUBLISHER_SEED (dev-only seed, never commit), PORTALDOT_WS

  tamper <build-dir>  DEMO ONLY: copy a build with one debit row silently removed and all hashes
                      recomputed, to show that verification against the source chain catches it
    --out <dir>         Output directory (required)
    --chunk <i>         Chunk to tamper with (default: first eligible)
`;

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      endpoint: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      last: { type: "string" },
      out: { type: "string" },
      concurrency: { type: "string" },
      segment: { type: "string" },
      strategy: { type: "string" },
      chunks: { type: "string" },
      rebuild: { type: "boolean" },
      "no-reconcile": { type: "boolean" },
      registry: { type: "string" },
      "dry-run": { type: "boolean" },
      "from-address": { type: "string" },
      chunk: { type: "string" },
    },
  });
  const int = (value: string | undefined) =>
    value === undefined ? undefined : Number.parseInt(value, 10);
  const log = (line: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);

  switch (command) {
    case "build": {
      const specPath = positionals[0];
      if (!specPath) throw new Error("build: missing <spec.json>");
      await runBuild({
        specPath,
        out: values.out ?? "builds",
        endpoint: values.endpoint,
        fromBlock: int(values.from),
        toBlock: int(values.to),
        last: int(values.last),
        concurrency: int(values.concurrency) ?? 64,
        segment: int(values.segment) ?? 2000,
        strategy: values.strategy === "per-block" ? "per-block" : "auto",
        log,
      });
      return;
    }
    case "verify": {
      const dir = positionals[0];
      if (!dir) throw new Error("verify: missing <build-dir>");
      const reports = await runVerify({
        dir,
        endpoint: values.endpoint,
        chunks: values.chunks?.split(",").map((n) => Number.parseInt(n, 10)),
        rebuild: values.rebuild ?? false,
        reconcile: !(values["no-reconcile"] ?? false),
        concurrency: int(values.concurrency) ?? 32,
        log,
      });
      const ok = reportsOk(reports);
      log(ok ? "VERIFIED" : "VERIFICATION FAILED");
      if (!ok) process.exitCode = 2;
      return;
    }
    case "publish": {
      const dir = positionals[0];
      if (!dir) throw new Error("publish: missing <build-dir>");
      await runPublish({
        dir,
        registry: values.registry,
        dryRun: values["dry-run"] ?? false,
        fromAddress: values["from-address"],
        log,
      });
      return;
    }
    case "tamper": {
      const dir = positionals[0];
      if (!dir || !values.out) throw new Error("tamper: usage tamper <build-dir> --out <dir>");
      await runTamper({ dir, out: values.out, chunk: int(values.chunk), log });
      return;
    }
    default:
      console.log(USAGE);
      if (command && command !== "help") process.exitCode = 1;
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
