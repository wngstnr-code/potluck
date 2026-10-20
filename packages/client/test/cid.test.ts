import { describe, expect, it } from "vitest";
import { blobCid } from "../src/cid.js";

describe("blobCid", () => {
  it("matches the CID computed with multiformats for a real Portaldot blob digest", () => {
    // Digest of a 16 KB blob stored on Portaldot V3 testnet (block 89,387), CID from multiformats.
    expect(blobCid("0x32e2579861ac53e15f000a9c5b159834521883f047d1685a55ff9deb869c5026")).toBe(
      "bafk2bzaceazoev4ymgwfhyk7aafjywyvta2feged6bd5c2c2kx7z324gtricm",
    );
  });

  it("rejects digests that are not 32 bytes", () => {
    expect(() => blobCid("0x1234")).toThrow("32 bytes");
  });
});
