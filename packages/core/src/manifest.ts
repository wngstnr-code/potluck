import { blake2AsHex } from "@polkadot/util-crypto";
import { canonicalJson, type Spec, specHash } from "@potluck/spec";
import { z } from "zod";
import type { BuiltChunk } from "./chunk.js";
import { merkleRoot } from "./encoding.js";

export const MANIFEST_ENCODING = "ndjson+gzip";

const HEX32 = /^0x[0-9a-f]{64}$/;
const location = z
  .object({ block: z.number().int().nonnegative(), index: z.number().int().nonnegative() })
  .strict();

const manifestChunkSchema = z
  .object({
    fromBlock: z.number().int().nonnegative(),
    toBlock: z.number().int().nonnegative(),
    rows: z.number().int().nonnegative(),
    /** blake2b-256 of the uncompressed canonical NDJSON. */
    rawHash: z.string().regex(HEX32),
    blob: z
      .object({
        /** blake2b-256 of the gzip blob = its TransactionStorage content hash. */
        digest: z.string().regex(HEX32),
        size: z.number().int().positive(),
        /** Where the blob was stored (`transactionStorage.store`); null in a draft. */
        location: location.nullable(),
      })
      .strict(),
    accounts: z.number().int().nonnegative(),
    bloom: z.string().min(1),
  })
  .strict();

export const manifestSchema = z
  .object({
    potluck: z.literal(1),
    spec: z.string().regex(HEX32),
    source: z.object({ chain: z.string(), genesisHash: z.string().regex(HEX32) }).strict(),
    range: z
      .object({
        fromBlock: z.number().int().nonnegative(),
        toBlock: z.number().int().nonnegative(),
        /** Finalized hash of toBlock on the source chain. */
        toBlockHash: z.string().regex(HEX32),
      })
      .strict(),
    encoding: z.literal(MANIFEST_ENCODING),
    chunks: z.array(manifestChunkSchema).min(1),
    /** keccak256 Merkle root over the chunks' rawHash values, in order. */
    chunksRoot: z.string().regex(HEX32),
    /** Publisher's H160 on Portaldot; null in a draft. */
    publisher: z
      .string()
      .regex(/^0x[0-9a-f]{40}$/)
      .nullable(),
    tool: z.string(),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestChunk = z.infer<typeof manifestChunkSchema>;

export function manifestChunk(chunk: BuiltChunk): ManifestChunk {
  return {
    fromBlock: chunk.fromBlock,
    toBlock: chunk.toBlock,
    rows: chunk.rows,
    rawHash: chunk.rawHash,
    blob: { digest: blake2AsHex(chunk.blob, 256), size: chunk.blob.length, location: null },
    accounts: chunk.accounts,
    bloom: chunk.bloom,
  };
}

/** Checks coverage, contiguity and the Merkle root; returns problems (empty when consistent). */
export function manifestProblems(manifest: Manifest): string[] {
  const problems: string[] = [];
  const { chunks, range } = manifest;
  if (range.fromBlock > range.toBlock) problems.push("range: fromBlock > toBlock");
  if (chunks[0]?.fromBlock !== range.fromBlock)
    problems.push("chunks do not start at range.fromBlock");
  if (chunks.at(-1)?.toBlock !== range.toBlock) problems.push("chunks do not end at range.toBlock");
  chunks.forEach((chunk, i) => {
    if (chunk.fromBlock > chunk.toBlock) problems.push(`chunk ${i}: fromBlock > toBlock`);
    const previous = chunks[i - 1];
    if (previous && chunk.fromBlock !== previous.toBlock + 1)
      problems.push(`chunk ${i}: not contiguous`);
  });
  if (merkleRoot(chunks.map((c) => c.rawHash)) !== manifest.chunksRoot)
    problems.push("chunksRoot mismatch");
  return problems;
}

export interface BuildManifestInput {
  spec: Spec;
  range: { fromBlock: number; toBlock: number; toBlockHash: string };
  chunks: readonly ManifestChunk[];
  publisher?: string | null;
  tool: string;
}

export function buildManifest(input: BuildManifestInput): Manifest {
  const manifest: Manifest = {
    potluck: 1,
    spec: specHash(input.spec),
    source: { chain: input.spec.source.chain, genesisHash: input.spec.source.genesisHash },
    range: {
      fromBlock: input.range.fromBlock,
      toBlock: input.range.toBlock,
      toBlockHash: input.range.toBlockHash.toLowerCase(),
    },
    encoding: MANIFEST_ENCODING,
    chunks: [...input.chunks],
    chunksRoot: merkleRoot(input.chunks.map((c) => c.rawHash)),
    publisher: input.publisher?.toLowerCase() ?? null,
    tool: input.tool,
  };
  const problems = manifestProblems(manifest);
  if (problems.length > 0) throw new Error(`invalid manifest: ${problems.join("; ")}`);
  return manifest;
}

/** Canonical JSON bytes: exactly what is stored in TransactionStorage. */
export function manifestBytes(manifest: Manifest): Uint8Array {
  return new TextEncoder().encode(canonicalJson(manifest));
}

/** blake2b-256 of the canonical bytes = the manifest blob's TransactionStorage content hash. */
export function manifestDigest(manifest: Manifest): `0x${string}` {
  return blake2AsHex(manifestBytes(manifest), 256) as `0x${string}`;
}

/** Parses and fully validates a manifest (schema, coverage, contiguity, Merkle root). */
export function parseManifest(input: Uint8Array | string | unknown): Manifest {
  const json =
    input instanceof Uint8Array
      ? JSON.parse(new TextDecoder().decode(input))
      : typeof input === "string"
        ? JSON.parse(input)
        : input;
  const manifest = manifestSchema.parse(json);
  const problems = manifestProblems(manifest);
  if (problems.length > 0) throw new Error(`invalid manifest: ${problems.join("; ")}`);
  return manifest;
}
