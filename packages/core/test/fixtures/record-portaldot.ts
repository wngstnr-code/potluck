/**
 * Records real Portaldot V3 testnet blocks containing ERC-20 `Transfer` logs (emitted on chain as
 * `Revive.ContractEmitted` events) plus the executing runtime's metadata, for offline tests.
 * The matching `eth_getLogs` results are stored too, as an independent cross-check.
 *
 * Run: pnpm --filter @potluck/core exec tsx test/fixtures/record-portaldot.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fetchRawEvents } from "../../src/events.js";
import { connectWs, getBlockHashes, getGenesisHash } from "../../src/rpc.js";
import { getRuntimeVersion, hexToBytes } from "../../src/runtime.js";

const WS = "wss://test-node-v3.portaldot.dev";
const EVM_RPC = "https://test-evm-rpc-v3.portaldot.dev";
const DIR = import.meta.dirname;
const BLOCKS = [97_632, 102_867];
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function ethLogs(block: number): Promise<unknown[]> {
  const response = await fetch(EVM_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [
        {
          fromBlock: `0x${block.toString(16)}`,
          toBlock: `0x${block.toString(16)}`,
          topics: [TRANSFER_TOPIC],
        },
      ],
    }),
  });
  return ((await response.json()) as { result: unknown[] }).result;
}

async function main(): Promise<void> {
  const client = await connectWs(WS);
  const genesisHash = await getGenesisHash(client);
  const metadata = new Map<number, Uint8Array>();
  const blocks = [];
  for (const number of BLOCKS) {
    const [parentHash, hash] = (await getBlockHashes(client, [number - 1, number])) as [
      string,
      string,
    ];
    const executingSpec = (await getRuntimeVersion(client, parentHash)).specVersion;
    if (!metadata.has(executingSpec)) {
      metadata.set(
        executingSpec,
        hexToBytes(await client.send<string>("state_getMetadata", [parentHash])),
      );
    }
    const events = await fetchRawEvents(client, hash);
    blocks.push({
      number,
      hash,
      executingSpec,
      eventsHex: Buffer.from(events).toString("hex"),
      ethTransferLogs: await ethLogs(number),
    });
  }
  for (const [spec, bytes] of metadata) {
    writeFileSync(
      join(DIR, `metadata-portaldot-v3-${spec}.scale.gz`),
      gzipSync(bytes, { level: 9 }),
    );
  }
  writeFileSync(
    join(DIR, "portaldot-v3.blocks.json"),
    `${JSON.stringify({ source: WS, recordedAt: new Date().toISOString(), genesisHash, blocks }, null, 2)}\n`,
  );
  console.log(
    `recorded ${blocks.length} blocks; metadata specs ${[...metadata.keys()].join(", ")}`,
  );
  await client.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
