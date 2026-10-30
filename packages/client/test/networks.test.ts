import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpec, specHash } from "@potluck/spec";
import { describe, expect, it } from "vitest";
import { NETWORKS } from "../src/networks.js";

const specFile = (name: string) =>
  parseSpec(
    JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "..", "..", "specs", `${name}.json`), "utf8"),
    ),
  );

describe("network presets", () => {
  for (const [network, preset] of Object.entries(NETWORKS)) {
    for (const [name, hash] of Object.entries(preset.specs)) {
      it(`${network}: ${name} matches the hash of specs/${name}.json`, () => {
        const spec = specFile(name);
        expect(spec.name).toBe(name);
        expect(specHash(spec)).toBe(hash);
      });

      it(`${network}: has an endpoint for ${name}'s source chain`, () => {
        expect(preset.endpoints[specFile(name).source.chain]).toMatch(/^wss:\/\//);
      });
    }
  }
});
