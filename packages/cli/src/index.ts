#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runBuild } from "./build.js";

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
        log,
      });
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
