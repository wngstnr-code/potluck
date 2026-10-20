/**
 * S2 (fee part, no tPOT needed): measure the real fee of `transactionStorage.store` on Portaldot V3
 * for several blob sizes via `paymentInfo` (fee estimation needs an address, not funds), and the
 * largest blob the public WSS endpoint accepts. Storing for real still needs tPOT.
 */
import { ApiPromise, WsProvider } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { ENDPOINTS, log, nowIso, withTimeout, writeResult } from "./common.js";

/** Any funded-or-not address works for fee estimation; this is a validator stash. */
const WHO = "5F4ZyJJ8R3QHZKRLAfDXdUuVE4w3Q7uq7tCNfAtvf2XEBfYY";
const SIZES = [1_000, 100_000, 1_000_000, 4_000_000, 7_800_000];

async function main(): Promise<void> {
  // 90 s request timeout: uploading a ~16 MB hex payload takes ~30 s from a slow link.
  const provider = new WsProvider(ENDPOINTS.portaldotTestnet, 1_000, {}, 90_000);
  const api = await withTimeout(
    ApiPromise.create({ provider, noInitWarn: true }),
    30_000,
    "connect",
  );
  const store = api.tx.transactionStorage?.store;
  if (!store) throw new Error("runtime has no transactionStorage.store");
  const measurements = [];
  for (const size of SIZES) {
    // Raw bytes must be passed as hex (S8): a Uint8Array would be read as SCALE-encoded.
    const data = u8aToHex(new Uint8Array(size).map((_, i) => i % 251));
    const started = performance.now();
    const info = await store(data).paymentInfo(WHO);
    const feePlanck = info.partialFee.toBigInt();
    measurements.push({
      bytes: size,
      feePlanck: feePlanck.toString(),
      feeTpot: Number(feePlanck) / 1e14,
      tpotPerMB: Number(feePlanck) / 1e14 / (size / 1e6),
      weightRefTime: info.weight.refTime.toString(),
      estimateMs: Math.round(performance.now() - started),
    });
    log(`${size} B → ${(Number(feePlanck) / 1e14).toFixed(4)} tPOT`);
  }
  const result = {
    spike: "S2 (fees only)",
    measuredAt: nowIso(),
    endpoint: ENDPOINTS.portaldotTestnet,
    maxTransactionSize: 8_388_608,
    measurements,
  };
  log(`result written to ${writeResult("s2-store-fees", result)}`);
  await api.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
