/**
 * Records real Polkadot Asset Hub data used by offline tests:
 *  - blocks around the runtime upgrade at #16,946,479 (the block that applies set_code), whose
 *    events only decode with the PARENT state's runtime (spike S1);
 *  - one recent finalized block with several Balances events;
 *  - gzipped SCALE metadata for every runtime version involved.
 *
 * Run: pnpm --filter @potluck/core exec tsx test/fixtures/record.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { decodeEvents, fetchRawEvents } from "../../src/events.js";
import { connectWs, getBlockHashes, getFinalizedHead, getGenesisHash } from "../../src/rpc.js";
import { createDecodingRuntime, getRuntimeVersion, hexToBytes } from "../../src/runtime.js";

const URL = "wss://polkadot-asset-hub-rpc.polkadot.io";
const DIR = import.meta.dirname;
const UPGRADE_BLOCKS = [16_946_478, 16_946_479, 16_946_480];

interface RecordedBlock {
  number: number;
  hash: string;
  postStateSpec: number;
  eventsHex: string;
}

async function main(): Promise<void> {
  const client = await connectWs(URL);
  const genesisHash = await getGenesisHash(client);
  const metadata = new Map<number, Uint8Array>();
  const recordBlock = async (number: number, hash: string): Promise<RecordedBlock> => {
    const { specVersion } = await getRuntimeVersion(client, hash);
    if (!metadata.has(specVersion)) {
      metadata.set(specVersion, hexToBytes(await client.send<string>("state_getMetadata", [hash])));
    }
    const events = await fetchRawEvents(client, hash);
    return {
      number,
      hash,
      postStateSpec: specVersion,
      eventsHex: Buffer.from(events).toString("hex"),
    };
  };

  const upgradeHashes = await getBlockHashes(client, UPGRADE_BLOCKS);
  const blocks: RecordedBlock[] = [];
  for (const [i, number] of UPGRADE_BLOCKS.entries()) {
    blocks.push(await recordBlock(number, upgradeHashes[i] as string));
  }

  // A recent finalized block with at least 4 Balances events (walk back from the finalized head).
  const head = await getFinalizedHead(client);
  let balancesBlock: RecordedBlock | undefined;
  for (let n = head.number; n > head.number - 300 && !balancesBlock; n--) {
    const [hash, parentHash] = await getBlockHashes(client, [n, n - 1]);
    const executing = (await getRuntimeVersion(client, parentHash as string)).specVersion;
    if (!metadata.has(executing)) {
      metadata.set(
        executing,
        hexToBytes(await client.send<string>("state_getMetadata", [parentHash])),
      );
    }
    const runtime = createDecodingRuntime(executing, metadata.get(executing) as Uint8Array);
    const events = decodeEvents(runtime, n, await fetchRawEvents(client, hash as string));
    if (events.filter((e) => e.pallet === "Balances").length >= 4) {
      balancesBlock = await recordBlock(n, hash as string);
    }
  }
  if (!balancesBlock) throw new Error("no recent block with Balances events found");
  blocks.push(balancesBlock);

  for (const [spec, bytes] of metadata) {
    writeFileSync(
      join(DIR, `metadata-polkadot-ah-${spec}.scale.gz`),
      gzipSync(bytes, { level: 9 }),
    );
  }
  writeFileSync(
    join(DIR, "polkadot-ah.blocks.json"),
    `${JSON.stringify(
      {
        source: URL,
        recordedAt: new Date().toISOString(),
        genesisHash,
        metadataSpecs: [...metadata.keys()].sort(),
        blocks,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `recorded ${blocks.length} blocks, metadata for specs ${[...metadata.keys()].join(", ")}`,
  );
  await client.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
