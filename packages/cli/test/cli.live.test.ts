/**
 * Live end-to-end test of the publisher CLI against the public Portaldot V3 testnet:
 * build twice (determinism) → verify with re-index and reconciliation → tamper → verify fails.
 * Skipped unless POTLUCK_LIVE=1.
 */
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runBuild } from "../src/build.js";
import { runTamper } from "../src/tamper.js";
import { reportsOk, runVerify } from "../src/verify.js";

const LIVE = process.env.POTLUCK_LIVE === "1";
const SPEC = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "specs",
  "portaldot-v3-testnet.unified-history.json",
);
const quiet = () => {};

describe.skipIf(!LIVE)("potluck CLI on Portaldot V3 testnet", () => {
  it("builds deterministically, verifies, and catches a tampered build", async () => {
    const root = await mkdtemp(join(tmpdir(), "potluck-cli-"));
    const common = {
      specPath: SPEC,
      fromBlock: 97_000,
      toBlock: 103_100,
      concurrency: 32,
      segment: 2000,
      log: quiet,
    };
    const a = await runBuild({ ...common, out: join(root, "a") });
    const b = await runBuild({ ...common, out: join(root, "b") });
    expect(a.digest).toBe(b.digest);
    expect(await readFile(a.manifestPath)).toEqual(await readFile(b.manifestPath));
    expect(a.rows).toBeGreaterThan(0);

    const honest = await runVerify({
      dir: a.dir,
      rebuild: true,
      reconcile: true,
      concurrency: 32,
      log: quiet,
    });
    expect(reportsOk(honest)).toBe(true);

    const forgedDir = join(root, "forged");
    const { account } = await runTamper({ dir: a.dir, out: forgedDir, log: quiet });
    const integrityOnly = await runVerify({
      dir: forgedDir,
      rebuild: false,
      reconcile: false,
      concurrency: 32,
      log: quiet,
    });
    expect(reportsOk(integrityOnly)).toBe(true); // a consistent forgery passes L1 alone
    const forged = await runVerify({
      dir: forgedDir,
      rebuild: true,
      reconcile: true,
      concurrency: 32,
      log: quiet,
    });
    expect(reportsOk(forged)).toBe(false);
    expect(forged[0]?.rebuild).toBe("mismatch");
    expect(forged[0]?.reconciled?.failures.some((f) => f.startsWith(account))).toBe(true);
  }, 600_000);
});
