import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalSpecBytes } from "@potluck/spec";
import { describe, expect, it } from "vitest";
import { loadSpec } from "../src/build.js";
import { type BuildRange, listBuilds, planNextRange } from "../src/sync.js";

const SPEC = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "specs",
  "portaldot-v3-testnet.unified-history.json",
);

describe("planNextRange", () => {
  const build = (fromBlock: number, toBlock: number, complete = true): BuildRange => ({
    dir: `${fromBlock}-${toBlock}`,
    fromBlock,
    toBlock,
    complete,
  });

  it("indexes from the newest complete build to the head", () => {
    expect(planNextRange([build(1, 100), build(101, 500)], 2_000, 1_000)).toEqual({
      kind: "build",
      fromBlock: 501,
      toBlock: 2_000,
      resume: false,
    });
  });

  it("skips when too few blocks are new", () => {
    const step = planNextRange([build(1, 500)], 1_200, 1_000);
    expect(step.kind).toBe("skip");
    expect(planNextRange([build(1, 500)], 500, 1).kind).toBe("skip");
  });

  it("resumes an unfinished build that continues the newest one, whatever its size", () => {
    expect(planNextRange([build(1, 500), build(501, 520, false)], 9_000, 1_000)).toEqual({
      kind: "build",
      fromBlock: 501,
      toBlock: 520,
      resume: true,
    });
  });

  it("needs a first build", () => {
    expect(() => planNextRange([build(1, 500, false)], 9_000, 1)).toThrow(/potluck build/);
  });
});

describe("listBuilds", () => {
  it("finds this spec's builds and ignores other spec versions and stray folders", async () => {
    const spec = await loadSpec(SPEC);
    const out = await mkdtemp(join(tmpdir(), "potluck-sync-"));
    const make = async (name: string, specBytes: Uint8Array, complete: boolean) => {
      const dir = join(out, spec.name, name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "spec.json"), specBytes);
      if (complete) await writeFile(join(dir, "manifest.draft.json"), "{}");
    };
    await make("101-200", canonicalSpecBytes(spec), false);
    await make("1-100", canonicalSpecBytes(spec), true);
    await make("201-300", new TextEncoder().encode("{}"), true);
    await mkdir(join(out, spec.name, "notes"), { recursive: true });

    const builds = await listBuilds(out, spec);
    expect(builds.map((b) => [b.fromBlock, b.toBlock, b.complete])).toEqual([
      [1, 100, true],
      [101, 200, false],
    ]);
  });
});
