/**
 * S6: Measure safe sustained throughput of public RPC endpoints for the publisher's hot loop
 * (`chain_getBlockHash` + `state_getStorage(System.Events)` per block), and whether each endpoint
 * serves archive state (needed for the Polkadot AH window starting at block 11,405,259).
 *
 * Uses a raw WsProvider (no metadata download) so we measure the RPC, not client decoding.
 * Each level fetches a disjoint, recent block range to avoid cache effects.
 */
import { WsProvider } from "@polkadot/api";
import { xxhashAsHex } from "@polkadot/util-crypto";
import {
  log,
  mapPool,
  nowIso,
  POLKADOT_AH_REVIVE_START,
  withTimeout,
  writeResult,
} from "./common.js";

const SYSTEM_EVENTS_KEY = `${xxhashAsHex("System", 128)}${xxhashAsHex("Events", 128).slice(2)}`;

const CANDIDATES: Record<string, string> = {
  parity: "wss://polkadot-asset-hub-rpc.polkadot.io",
  dwellir: "wss://asset-hub-polkadot-rpc.dwellir.com",
  ibp: "wss://sys.ibp.network/asset-hub-polkadot",
  dotters: "wss://asset-hub-polkadot.dotters.network",
  onfinality: "wss://statemint.api.onfinality.io/public-ws",
  luckyfriday: "wss://rpc-asset-hub-polkadot.luckyfriday.io",
};

// Overridable for follow-up runs, e.g. S6_ONLY=parity S6_LEVELS=32,64,128 S6_BATCH_HASHES=1.
const ONLY = process.env.S6_ONLY?.split(",").filter(Boolean);
const LEVELS = (process.env.S6_LEVELS ?? "1,4,8,16,32").split(",").map(Number);
const BLOCKS_PER_LEVEL = Number(process.env.S6_BLOCKS_PER_LEVEL ?? 200);
/** Fetch all block hashes of a level in one `chain_getBlockHash([n1, n2, ...])` call. */
const BATCH_HASHES = process.env.S6_BATCH_HASHES === "1";
const OUTPUT_NAME = process.env.S6_OUT ?? "s6-rpc-throughput";

interface LevelResult {
  concurrency: number;
  blocks: number;
  errors: number;
  seconds: number;
  blocksPerSecond: number;
  bytes: number;
}

async function measureEndpoint(name: string, url: string) {
  const provider = new WsProvider(url, false);
  try {
    await withTimeout(provider.connect(), 15_000, `connect ${name}`);
    await withTimeout(provider.isReady, 15_000, `ready ${name}`);
  } catch (error) {
    return { name, url, reachable: false, error: String(error) };
  }

  const send = <T>(method: string, params: unknown[]) =>
    withTimeout(provider.send<T>(method, params), 30_000, `${name} ${method}`);

  const result: Record<string, unknown> = { name, url, reachable: true };
  try {
    const header = await send<{ number: string }>("chain_getHeader", []);
    const head = Number.parseInt(header.number, 16);
    result.head = head;

    // Archive check: state at the start of the Revive window must be readable.
    try {
      const oldHash = await send<string>("chain_getBlockHash", [POLKADOT_AH_REVIVE_START]);
      const oldEvents = await send<string | null>("state_getStorage", [SYSTEM_EVENTS_KEY, oldHash]);
      result.archive = oldEvents !== null;
    } catch (error) {
      result.archive = false;
      result.archiveError = String(error).slice(0, 160);
    }

    const levels: LevelResult[] = [];
    let cursor = head - 50; // stay behind the tip
    for (const concurrency of LEVELS) {
      const blocks = Array.from({ length: BLOCKS_PER_LEVEL }, (_, i) => cursor - i);
      cursor -= BLOCKS_PER_LEVEL;
      let errors = 0;
      let bytes = 0;
      const started = performance.now();
      const hashes = BATCH_HASHES
        ? await send<string[]>("chain_getBlockHash", [blocks])
        : undefined;
      await mapPool(blocks, concurrency, async (block, i) => {
        try {
          const hash = hashes?.[i] ?? (await send<string>("chain_getBlockHash", [block]));
          const events = await send<string | null>("state_getStorage", [SYSTEM_EVENTS_KEY, hash]);
          bytes += events ? (events.length - 2) / 2 : 0;
        } catch {
          errors++;
        }
      });
      const seconds = (performance.now() - started) / 1000;
      const level = {
        concurrency,
        blocks: BLOCKS_PER_LEVEL,
        errors,
        seconds: Number(seconds.toFixed(2)),
        blocksPerSecond: Number(((BLOCKS_PER_LEVEL - errors) / seconds).toFixed(1)),
        bytes,
      };
      levels.push(level);
      log(`${name} c=${concurrency}: ${level.blocksPerSecond} blocks/s, errors=${errors}`);
      if (errors > BLOCKS_PER_LEVEL / 4) break; // endpoint is throttling; stop escalating
    }
    result.levels = levels;
  } catch (error) {
    result.error = String(error).slice(0, 200);
  } finally {
    await provider.disconnect();
  }
  return result;
}

async function main(): Promise<void> {
  const endpoints = [];
  for (const [name, url] of Object.entries(CANDIDATES)) {
    if (ONLY && !ONLY.includes(name)) continue;
    log(`measuring ${name} (${url})`);
    endpoints.push(await measureEndpoint(name, url));
  }
  const windowBlocks =
    (endpoints.find((e) => typeof e.head === "number")?.head as number) - POLKADOT_AH_REVIVE_START;
  const result = {
    spike: "S6",
    measuredAt: nowIso(),
    chain: "polkadot-asset-hub",
    method: "chain_getBlockHash + state_getStorage(System.Events) per block, raw WsProvider",
    blocksPerLevel: BLOCKS_PER_LEVEL,
    batchedBlockHashes: BATCH_HASHES,
    reviveWindowBlocks: windowBlocks,
    endpoints,
  };
  log(`result written to ${writeResult(OUTPUT_NAME, result)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
