import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Abi, toEventSelector, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { REGISTRY_ABI } from "../src/registry.js";

const ARTIFACT = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "contracts",
  "out",
  "PotluckRegistry.sol",
  "PotluckRegistry.json",
);

const selectors = (abi: Abi) =>
  abi
    .filter((item) => item.type === "function" || item.type === "event")
    .map((item) =>
      item.type === "function" ? `fn ${toFunctionSelector(item)}` : `ev ${toEventSelector(item)}`,
    )
    .sort();

describe.skipIf(!existsSync(ARTIFACT))("REGISTRY_ABI", () => {
  it("matches every function and event of the compiled contract (run `pnpm build:contracts` first)", () => {
    const compiled = (JSON.parse(readFileSync(ARTIFACT, "utf8")) as { abi: Abi }).abi;
    expect(selectors(REGISTRY_ABI)).toEqual(selectors(compiled));
  });
});
