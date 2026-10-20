import { connectWs, type RpcClient, withRetry } from "@potluck/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchBlob } from "../src/blobs.js";

const LIVE = process.env.POTLUCK_LIVE === "1";
/** A 16 KB blob some participant stored in Portaldot V3 TransactionStorage at block 89,387. */
const STORED = "0x32e2579861ac53e15f000a9c5b159834521883f047d1685a55ff9deb869c5026";

describe.skipIf(!LIVE)("fetchBlob on Portaldot V3 testnet", () => {
  let client: RpcClient;
  beforeAll(async () => {
    client = withRetry(await connectWs("wss://test-node-v3.portaldot.dev"));
  });
  afterAll(async () => {
    await client?.close();
  });

  it("fetches a stored blob by digest and checks it", async () => {
    const bytes = await fetchBlob(client, STORED);
    expect(bytes.length).toBe(16_564);
  });

  it("reports blobs that are not stored", async () => {
    await expect(fetchBlob(client, `0x${"ab".repeat(32)}`)).rejects.toThrow("is not available");
  });
});
