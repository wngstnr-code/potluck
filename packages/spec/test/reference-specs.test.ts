import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { specHash, validateSpec } from "../src/index.js";

const SPECS_DIR = join(import.meta.dirname, "..", "..", "..", "specs");
const files = readdirSync(SPECS_DIR).filter((f) => f.endsWith(".json"));

describe("reference specs in /specs", () => {
  it("exist", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of files) {
    it(`${file} is valid, named after its file, and hashable`, () => {
      const input = JSON.parse(readFileSync(join(SPECS_DIR, file), "utf8")) as unknown;
      const result = validateSpec(input);
      if (!result.ok) throw new Error(result.errors.join("\n"));
      expect(`${result.spec.name}.json`).toBe(file);
      expect(specHash(result.spec)).toMatch(/^0x[0-9a-f]{64}$/);
    });
  }
});
