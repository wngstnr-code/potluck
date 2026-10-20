import type { Manifest } from "@potluck/core";
import { describe, expect, it } from "vitest";
import { planCoverage } from "../src/coverage.js";
import type { ManifestEntry } from "../src/source.js";

/** Only the fields the planner reads; full manifests are validated by core's parseManifest tests. */
const entry = (
  fromBlock: number,
  toBlock: number,
  flags = 0,
  digest = `${fromBlock}-${toBlock}-${flags}`,
): ManifestEntry => ({
  manifest: { range: { fromBlock, toBlock, toBlockHash: "0x" } } as unknown as Manifest,
  digest,
  publisher: null,
  flags,
});
const shape = (segments: ReturnType<typeof planCoverage>) =>
  segments.map((s) => [
    s.mode,
    s.fromBlock,
    s.toBlock,
    s.mode === "snapshot" ? s.entry.digest : "",
  ]);

describe("planCoverage", () => {
  it("syncs everything directly when there are no manifests and the range is short", () => {
    expect(
      shape(planCoverage([], { fromBlock: 1, toBlock: 100 }, { maxDirectBlocks: 1000 })),
    ).toEqual([["direct", 1, 100, ""]]);
  });

  it("marks long gaps as uncovered and short tails as direct (progressive backfill)", () => {
    const plan = planCoverage(
      [entry(500, 900)],
      { fromBlock: 1, toBlock: 950 },
      { maxDirectBlocks: 100 },
    );
    expect(shape(plan)).toEqual([
      ["uncovered", 1, 499, ""],
      ["snapshot", 500, 900, "500-900-0"],
      ["direct", 901, 950, ""],
    ]);
  });

  it("chains overlapping manifests, reaching furthest first", () => {
    const plan = planCoverage(
      [entry(1, 400), entry(300, 800), entry(350, 600)],
      { fromBlock: 1, toBlock: 800 },
      { maxDirectBlocks: 10 },
    );
    expect(shape(plan)).toEqual([
      ["snapshot", 1, 400, "1-400-0"],
      ["snapshot", 401, 800, "300-800-0"],
    ]);
  });

  it("prefers unflagged manifests and uses flagged ones only as a last resort", () => {
    const plan = planCoverage(
      [entry(1, 1000, 2, "flagged"), entry(1, 600, 0, "clean")],
      { fromBlock: 1, toBlock: 1000 },
      { maxDirectBlocks: 10 },
    );
    expect(shape(plan)).toEqual([
      ["snapshot", 1, 600, "clean"],
      ["snapshot", 601, 1000, "flagged"],
    ]);
  });
});
