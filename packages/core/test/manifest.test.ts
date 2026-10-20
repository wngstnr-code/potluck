import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blake2AsHex } from "@polkadot/util-crypto";
import { parseSpec, specHash } from "@potluck/spec";
import { beforeAll, describe, expect, it } from "vitest";
import { buildChunk, planChunks } from "../src/chunk.js";
import { compileSpec, eventsToRows } from "../src/engine.js";
import { decodeEvents } from "../src/events.js";
import {
  buildManifest,
  type Manifest,
  type ManifestChunk,
  manifestBytes,
  manifestChunk,
  manifestDigest,
  parseManifest,
} from "../src/manifest.js";
import { portaldotRuntime, portaldotV3 } from "./fixtures.js";

const spec = parseSpec(
  JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "specs",
        "portaldot-v3-testnet.unified-history.json",
      ),
      "utf8",
    ),
  ),
);
const [first, second] = portaldotV3.blocks as [
  (typeof portaldotV3.blocks)[0],
  (typeof portaldotV3.blocks)[0],
];
const range = { fromBlock: first.number, toBlock: second.number, toBlockHash: second.hash };

let chunks: ManifestChunk[];
let manifest: Manifest;

beforeAll(async () => {
  const rows = eventsToRows(
    compileSpec(spec),
    [first, second].flatMap((b) =>
      decodeEvents(portaldotRuntime(b.executingSpec), b.number, `0x${b.eventsHex}`),
    ),
  );
  const tightSpec = { ...spec, chunk: { maxBlocks: 1000, maxRawBytes: 32_000_000 } };
  const plans = planChunks(tightSpec, rows, range);
  chunks = await Promise.all(plans.map(async (p) => manifestChunk(await buildChunk(spec, p))));
  manifest = buildManifest({ spec, range, chunks, tool: "potluck-test" });
});

describe("manifest", () => {
  it("is built from real chunks with a valid root and coverage", () => {
    expect(chunks.length).toBeGreaterThan(1);
    expect(manifest.spec).toBe(specHash(spec));
    expect(manifest.chunks[0]?.fromBlock).toBe(range.fromBlock);
    expect(manifest.chunks.at(-1)?.toBlock).toBe(range.toBlock);
    expect(manifest.publisher).toBeNull();
    expect(manifest.chunks.every((c) => c.blob.location === null)).toBe(true);
  });

  it("round-trips through canonical bytes and its digest is blake2b-256 of them", () => {
    const bytes = manifestBytes(manifest);
    expect(parseManifest(bytes)).toEqual(manifest);
    expect(manifestDigest(manifest)).toBe(blake2AsHex(bytes, 256));
    const reordered = Object.fromEntries(Object.entries(manifest).reverse());
    expect(manifestDigest(parseManifest(reordered))).toBe(manifestDigest(manifest));
  });

  it("rejects gaps, wrong coverage, root mismatches and bad shapes", () => {
    const gap = structuredClone(manifest);
    (gap.chunks[1] as ManifestChunk).fromBlock += 1;
    expect(() => parseManifest(gap)).toThrow("not contiguous");
    const short = structuredClone(manifest);
    short.range.toBlock += 1;
    expect(() => parseManifest(short)).toThrow("do not end at range.toBlock");
    const root = structuredClone(manifest);
    root.chunksRoot = `0x${"00".repeat(32)}`;
    expect(() => parseManifest(root)).toThrow("chunksRoot mismatch");
    expect(() => parseManifest({ ...manifest, extra: 1 })).toThrow();
    expect(() => parseManifest({ ...manifest, encoding: "csv" })).toThrow();
  });

  it("buildManifest refuses inconsistent chunk lists", () => {
    expect(() => buildManifest({ spec, range, chunks: chunks.slice(1), tool: "t" })).toThrow(
      "do not start at range.fromBlock",
    );
  });
});
