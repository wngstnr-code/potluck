import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createDecodingRuntime, type DecodingRuntime } from "../src/runtime.js";

const DIR = join(import.meta.dirname, "fixtures");

export interface FixtureBlock {
  number: number;
  hash: string;
  postStateSpec: number;
  eventsHex: string;
}

export interface BlocksFixture {
  genesisHash: string;
  metadataSpecs: number[];
  blocks: FixtureBlock[];
}

/** Real Polkadot Asset Hub data recorded by test/fixtures/record.ts. */
export const polkadotAh = JSON.parse(
  readFileSync(join(DIR, "polkadot-ah.blocks.json"), "utf8"),
) as BlocksFixture;

export function fixtureBlock(number: number): FixtureBlock {
  const block = polkadotAh.blocks.find((b) => b.number === number);
  if (!block) throw new Error(`no fixture block #${number}`);
  return block;
}

export function metadataBytes(specVersion: number): Uint8Array {
  return new Uint8Array(
    gunzipSync(readFileSync(join(DIR, `metadata-polkadot-ah-${specVersion}.scale.gz`))),
  );
}

const runtimes = new Map<number, DecodingRuntime>();
export function runtime(specVersion: number): DecodingRuntime {
  let r = runtimes.get(specVersion);
  if (!r) {
    r = createDecodingRuntime(specVersion, metadataBytes(specVersion));
    runtimes.set(specVersion, r);
  }
  return r;
}

export interface PortaldotBlock {
  number: number;
  hash: string;
  executingSpec: number;
  eventsHex: string;
  ethTransferLogs: { address: string; topics: string[]; data: string; logIndex: string }[];
}

/** Real Portaldot V3 testnet blocks with ERC-20 logs, recorded by test/fixtures/record-portaldot.ts. */
export const portaldotV3 = JSON.parse(
  readFileSync(join(DIR, "portaldot-v3.blocks.json"), "utf8"),
) as { genesisHash: string; blocks: PortaldotBlock[] };

const portaldotRuntimes = new Map<number, DecodingRuntime>();
export function portaldotRuntime(specVersion: number): DecodingRuntime {
  let r = portaldotRuntimes.get(specVersion);
  if (!r) {
    r = createDecodingRuntime(
      specVersion,
      new Uint8Array(
        gunzipSync(readFileSync(join(DIR, `metadata-portaldot-v3-${specVersion}.scale.gz`))),
      ),
    );
    portaldotRuntimes.set(specVersion, r);
  }
  return r;
}
