import { describe, expect, it } from "vitest";
import { planRenewal } from "../src/renew.js";

const RETENTION = 100_800; // Portaldot V3 TransactionStorage.RetentionPeriod

describe("planRenewal", () => {
  it("keeps entries far from the end of the retention period", () => {
    expect(planRenewal(1_000, 50_000, RETENTION, 14_400, true)).toEqual({
      action: "keep",
      lastBlock: 101_800,
    });
  });

  it("renews entries whose last renewable block is within the window", () => {
    expect(planRenewal(1_000, 87_400, RETENTION, 14_400, true).action).toBe("renew");
    expect(planRenewal(1_000, 87_399, RETENTION, 14_400, true).action).toBe("keep");
    // The last block a renewal can still land in.
    expect(planRenewal(1_000, 101_799, RETENTION, 14_400, true).action).toBe("renew");
  });

  it("reports entries that can no longer be renewed", () => {
    expect(planRenewal(1_000, 101_800, RETENTION, 14_400, true).action).toBe("expired");
    expect(planRenewal(1_000, 2_000, RETENTION, 14_400, false).action).toBe("expired");
  });
});
