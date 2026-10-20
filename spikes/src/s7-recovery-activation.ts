/**
 * S7: Locate the block where the (new, inheritance-capable) Recovery pallet first exists on
 * Kusama Asset Hub. This is the `fromBlock` of the kusama-ah.recovery-timeline spec.
 *
 * Method: binary search on the existence of the pallet storage-version key
 * twox128("Recovery") ++ twox128(":__STORAGE_VERSION__:"), then confirm the runtime at that block
 * exposes the friend-group API, and snapshot current usage.
 */
import { xxhashAsHex } from "@polkadot/util-crypto";
import {
  blockTimestamp,
  connect,
  ENDPOINTS,
  hasStorage,
  log,
  nowIso,
  storageQuery,
  writeResult,
} from "./common.js";

const STORAGE_VERSION_KEY = `${xxhashAsHex("Recovery", 128)}${xxhashAsHex(":__STORAGE_VERSION__:", 128).slice(2)}`;

async function main(): Promise<void> {
  const api = await connect(ENDPOINTS.kusamaAssetHub);
  const head = (await api.rpc.chain.getHeader()).number.toNumber();

  const hasPallet = async (block: number): Promise<boolean> => {
    const hash = await api.rpc.chain.getBlockHash(block);
    const raw = await api.rpc.state.getStorage(STORAGE_VERSION_KEY, hash);
    return raw !== null && raw !== undefined && !(raw as { isEmpty?: boolean }).isEmpty;
  };

  if (!(await hasPallet(head))) throw new Error("Recovery pallet not present at head");

  let lo = 0;
  let hi = head;
  let probes = 0;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    probes++;
    if (await hasPallet(mid)) hi = mid;
    else lo = mid + 1;
  }
  const firstBlock = lo;
  const firstHash = await api.rpc.chain.getBlockHash(firstBlock);
  const at = await api.at(firstHash);
  const timestamp = await blockTimestamp(at.query);
  const runtime = await api.rpc.state.getRuntimeVersion(firstHash);
  const hasFriendGroupsAtStart = hasStorage(at.query, "recovery", "friendGroups");
  log(`Recovery first present at #${firstBlock} (${new Date(timestamp).toISOString()})`);

  // The pallet existed before it gained the inheritance (friend-group) API. Find the first block
  // whose storage version equals the head's version, then confirm the API in that runtime.
  const storageVersionAt = async (block: number): Promise<number | null> => {
    const hash = await api.rpc.chain.getBlockHash(block);
    const raw = await api.rpc.state.getStorage(STORAGE_VERSION_KEY, hash);
    const bytes = (raw as { toU8a?: (bare?: boolean) => Uint8Array } | null)?.toU8a?.(true);
    if (!bytes || bytes.length < 2) return null;
    return (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8);
  };
  const headVersion = await storageVersionAt(head);
  let vlo = firstBlock;
  let vhi = head;
  while (vlo < vhi) {
    const mid = Math.floor((vlo + vhi) / 2);
    probes++;
    if ((await storageVersionAt(mid)) === headVersion) vhi = mid;
    else vlo = mid + 1;
  }
  const inheritanceBlock = vlo;
  const inheritanceHash = await api.rpc.chain.getBlockHash(inheritanceBlock);
  const inheritanceAt = await api.at(inheritanceHash);
  const inheritanceTimestamp = await blockTimestamp(inheritanceAt.query);
  const inheritanceRuntime = await api.rpc.state.getRuntimeVersion(inheritanceHash);
  const friendGroupsApi = hasStorage(inheritanceAt.query, "recovery", "friendGroups");
  log(
    `Recovery storage version ${headVersion} (inheritance API=${friendGroupsApi}) from #${inheritanceBlock} (${new Date(inheritanceTimestamp).toISOString()})`,
  );

  // Current usage snapshot.
  const configs = await storageQuery(api.query, "recovery", "friendGroups").entries();
  const attempts = await storageQuery(api.query, "recovery", "attempt").entries();
  const inheritors = await storageQuery(api.query, "recovery", "inheritor").entries();

  const result = {
    spike: "S7",
    measuredAt: nowIso(),
    chain: "kusama-asset-hub",
    endpoint: ENDPOINTS.kusamaAssetHub,
    head,
    binarySearchProbes: probes,
    recoveryFirstBlock: firstBlock,
    recoveryFirstBlockHash: firstHash.toHex(),
    recoveryFirstTimestamp: new Date(timestamp).toISOString(),
    specVersionAtFirstBlock: runtime.specVersion.toNumber(),
    friendGroupsApiAtFirstBlock: hasFriendGroupsAtStart,
    headStorageVersion: headVersion,
    inheritanceApiFirstBlock: inheritanceBlock,
    inheritanceApiFirstBlockHash: inheritanceHash.toHex(),
    inheritanceApiFirstTimestamp: new Date(inheritanceTimestamp).toISOString(),
    specVersionAtInheritanceBlock: inheritanceRuntime.specVersion.toNumber(),
    friendGroupsApiAtInheritanceBlock: friendGroupsApi,
    blocksSinceInheritanceApi: head - inheritanceBlock,
    usageNow: {
      configuredAccounts: configs.length,
      openAttempts: attempts.length,
      inheritorsRecorded: inheritors.length,
    },
  };
  log(`result written to ${writeResult("s7-recovery-activation", result)}`);
  console.log(JSON.stringify(result, null, 2));
  await api.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
