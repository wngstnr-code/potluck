import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildChunk,
  buildManifest,
  decodeNdjson,
  gunzip,
  manifestBytes,
  manifestChunk,
  parseManifest,
} from "@potluck/core";
import { parseSpec } from "@potluck/spec";
import { TOOL } from "./config.js";

export interface TamperOptions {
  dir: string;
  out: string;
  /** Chunk to tamper with (default: the first chunk that has a removable row). */
  chunk?: number;
  log: (line: string) => void;
}

/**
 * DEMO ONLY. Writes a copy of a build whose chunk silently drops one debit row while every hash,
 * bloom and the chunks root are recomputed, so the forgery passes the integrity checks (L1).
 * Only verification against the source chain (re-index or L3 reconciliation) can expose it.
 */
export async function runTamper(
  options: TamperOptions,
): Promise<{ chunk: number; account: string }> {
  const spec = parseSpec(JSON.parse(await readFile(join(options.dir, "spec.json"), "utf8")));
  if (spec.reconcile.type !== "balance-delta")
    throw new Error("tamper demo needs a balance-delta spec");
  const { debit, credit } = spec.reconcile;
  const draft = parseManifest(
    new Uint8Array(await readFile(join(options.dir, "manifest.draft.json"))),
  );

  const candidates = options.chunk !== undefined ? [options.chunk] : draft.chunks.map((_, i) => i);
  for (const index of candidates) {
    const chunk = draft.chunks[index];
    if (!chunk) throw new Error(`no chunk ${index}`);
    const blob = new Uint8Array(await readFile(join(options.dir, "chunks", `${index}.ndjson.gz`)));
    const rows = decodeNdjson(spec, await gunzip(blob));
    const resetAccounts = new Set(
      rows.filter((r) => r.effect === "reset").map((r) => r.cells[credit]),
    );
    const victim = rows.find(
      (r) =>
        r.effect === "delta" &&
        r.cells[debit] &&
        !r.cells[credit] &&
        !resetAccounts.has(r.cells[debit] ?? null),
    );
    if (!victim) continue;

    const forged = await buildChunk(spec, {
      fromBlock: chunk.fromBlock,
      toBlock: chunk.toBlock,
      rows: rows.filter((r) => r !== victim),
    });
    await mkdir(join(options.out, "chunks"), { recursive: true });
    await cp(join(options.dir, "spec.json"), join(options.out, "spec.json"));
    for (const [i] of draft.chunks.entries()) {
      if (i === index) await writeFile(join(options.out, "chunks", `${i}.ndjson.gz`), forged.blob);
      else
        await cp(
          join(options.dir, "chunks", `${i}.ndjson.gz`),
          join(options.out, "chunks", `${i}.ndjson.gz`),
        );
    }
    const chunks = draft.chunks.map((c, i) => (i === index ? manifestChunk(forged) : c));
    const manifest = buildManifest({
      spec,
      range: draft.range,
      chunks,
      tool: `${TOOL} (tampered demo)`,
    });
    await writeFile(join(options.out, "manifest.draft.json"), manifestBytes(manifest));
    const account = victim.cells[debit] as string;
    options.log(
      `tampered chunk ${index}: dropped ${victim.cells.kind ?? "row"} of ${victim.cells[spec.reconcile.amount]} from ${account} at #${victim.block}`,
    );
    options.log(
      `forged build written to ${options.out} (all hashes recomputed: integrity checks will pass)`,
    );
    return { chunk: index, account };
  }
  throw new Error("no chunk with a removable debit row");
}
