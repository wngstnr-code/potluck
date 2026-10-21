import { ApiPromise, WsProvider } from "@polkadot/api";
import type { SubmittableExtrinsic } from "@polkadot/api/types";
import { Keyring } from "@polkadot/keyring";
import type { KeyringPair } from "@polkadot/keyring/types";
import { u8aToHex } from "@polkadot/util";
import { REGISTRY_ABI } from "@potluck/core";
import { type Abi, decodeFunctionResult, encodeFunctionData, type Hex } from "viem";

export { REGISTRY_ABI };

export type ManifestInput = {
  specHash: Hex;
  sourceGenesis: Hex;
  fromBlock: bigint;
  toBlock: bigint;
  toBlockHash: Hex;
  chunksRoot: Hex;
  manifestDigest: Hex;
  tsBlock: number;
  tsIndex: number;
  chunkCount: number;
};

/**
 * Connects to Portaldot for transactions. Blob uploads travel as hex (2× size) and take ~30 s for
 * 7.8 MB, so requests get a 120 s timeout; the provider reconnects after the endpoint's 60 s drops.
 */
export async function connectPortaldot(url: string): Promise<ApiPromise> {
  const provider = new WsProvider(url, 1_000, {}, 120_000);
  return ApiPromise.create({ provider, noInitWarn: true });
}

export function signerFromSeed(seed: string): KeyringPair {
  return new Keyring({ type: "sr25519", ss58Format: 42 }).addFromUri(seed.trim());
}

type ReviveRuntimeApi = {
  address(account: string): Promise<{ toHex(): string }>;
  call(
    origin: string,
    dest: string,
    value: number,
    gasLimit: null,
    storageDepositLimit: null,
    input: string,
  ): Promise<{
    weightRequired: { refTime: { toBigInt(): bigint }; proofSize: { toBigInt(): bigint } };
    storageDeposit: { isCharge: boolean; asCharge: { toBigInt(): bigint } };
    result: {
      isOk: boolean;
      asOk: { flags: { toJSON(): { bits: number } }; data: { toHex(): string } };
      asErr: unknown;
    };
  }>;
};

function reviveApi(api: ApiPromise): ReviveRuntimeApi {
  const runtime = (api.call as unknown as { reviveApi?: ReviveRuntimeApi }).reviveApi;
  if (!runtime) throw new Error("runtime has no ReviveApi");
  return runtime;
}

/** H160 that pallet-revive maps an SS58 account to (runtime API; never computed locally). */
export async function reviveAddress(api: ApiPromise, account: string): Promise<string> {
  return (await reviveApi(api).address(account)).toHex().toLowerCase();
}

export interface CallEstimate {
  ok: boolean;
  reverted: boolean;
  returnData: Hex;
  refTime: bigint;
  proofSize: bigint;
  storageDeposit: bigint;
}

/** Dry-runs a contract call with ReviveApi.call (no signature, no funds). */
export async function estimateCall(
  api: ApiPromise,
  origin: string,
  contract: string,
  data: Hex,
): Promise<CallEstimate> {
  const result = await reviveApi(api).call(origin, contract, 0, null, null, data);
  const ok = result.result.isOk;
  return {
    ok,
    reverted: ok ? (result.result.asOk.flags.toJSON().bits & 1) === 1 : false,
    returnData: (ok ? result.result.asOk.data.toHex() : "0x") as Hex,
    refTime: result.weightRequired.refTime.toBigInt(),
    proofSize: result.weightRequired.proofSize.toBigInt(),
    storageDeposit: result.storageDeposit.isCharge ? result.storageDeposit.asCharge.toBigInt() : 0n,
  };
}

/** Reads a view function through ReviveApi.call. */
export async function readContract<T>(
  api: ApiPromise,
  origin: string,
  contract: string,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
): Promise<T> {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  const estimate = await estimateCall(api, origin, contract, data);
  if (!estimate.ok || estimate.reverted) throw new Error(`${functionName} reverted`);
  return decodeFunctionResult({ abi, functionName, data: estimate.returnData } as never) as T;
}

/** Registry id of the manifest with this digest from this publisher, or null if it is not there. */
export async function findManifestId(
  api: ApiPromise,
  origin: string,
  registry: string,
  specHash: string,
  manifestDigest: string,
  publisher: string,
): Promise<number | null> {
  const read = <T>(functionName: string, args: readonly unknown[]) =>
    readContract<T>(api, origin, registry, REGISTRY_ABI, functionName, args);
  const count = await read<bigint>("manifestCountBySpec", [specHash]);
  const ids = await read<readonly bigint[]>("manifestIdsBySpec", [specHash, 0n, count]);
  for (const id of [...ids].reverse()) {
    const m = await read<{ manifestDigest: string; publisher: string }>("getManifest", [id]);
    if (
      m.manifestDigest.toLowerCase() === manifestDigest.toLowerCase() &&
      m.publisher.toLowerCase() === publisher.toLowerCase()
    ) {
      return Number(id);
    }
  }
  return null;
}

/** A `revive.call` extrinsic with limits from a dry run plus 20% headroom. */
export function contractCallTx(
  api: ApiPromise,
  contract: string,
  data: Hex,
  estimate: CallEstimate,
): SubmittableExtrinsic<"promise"> {
  const call = api.tx.revive?.call;
  if (!call) throw new Error("runtime has no revive.call");
  const pad = (n: bigint) => (n * 12n) / 10n + 1n;
  return call(
    contract,
    0,
    { refTime: pad(estimate.refTime), proofSize: pad(estimate.proofSize) },
    pad(estimate.storageDeposit),
    data,
  );
}

/** `transactionStorage.store` for raw bytes. Bytes go as hex: a Uint8Array would be read as SCALE. */
export function storeTx(api: ApiPromise, bytes: Uint8Array): SubmittableExtrinsic<"promise"> {
  const store = api.tx.transactionStorage?.store;
  if (!store) throw new Error("runtime has no transactionStorage.store");
  return store(u8aToHex(bytes));
}

export interface Inclusion {
  blockHash: string;
  blockNumber: number;
  /** Fee actually paid (`TransactionPayment.TransactionFeePaid`), 0 if the event is missing. */
  fee: bigint;
  events: { section: string; method: string; data: { toJSON(): unknown }[] }[];
}

/** Signs, submits and waits for inclusion; rejects with the decoded dispatch error on failure. */
export function submit(
  api: ApiPromise,
  tx: SubmittableExtrinsic<"promise">,
  signer: KeyringPair,
): Promise<Inclusion> {
  return new Promise((resolve, reject) => {
    tx.signAndSend(signer, async (result) => {
      if (result.dispatchError) {
        let message = result.dispatchError.toString();
        if (result.dispatchError.isModule) {
          const meta = api.registry.findMetaError(result.dispatchError.asModule);
          message = `${meta.section}.${meta.name}`;
        }
        reject(new Error(`dispatch failed: ${message}`));
        return;
      }
      if (result.status.isInBlock) {
        const blockHash = result.status.asInBlock.toHex();
        const header = await api.rpc.chain.getHeader(blockHash);
        const paid = result.events.find(
          ({ event }) =>
            event.section === "transactionPayment" && event.method === "TransactionFeePaid",
        );
        resolve({
          blockHash,
          blockNumber: header.number.toNumber(),
          fee: paid ? BigInt(paid.event.data[1]?.toString() ?? 0) : 0n,
          events: result.events.map(({ event }) => ({
            section: event.section,
            method: event.method,
            data: [...event.data],
          })),
        });
      }
    }).catch(reject);
  });
}

/** `transactionStorage.renew` of the entry stored (or last renewed) at `block`/`index`. */
export function renewTx(
  api: ApiPromise,
  block: number,
  index: number,
): SubmittableExtrinsic<"promise"> {
  const renew = api.tx.transactionStorage?.renew;
  if (!renew) throw new Error("runtime has no transactionStorage.renew");
  return renew(block, index);
}

/** Blocks a stored entry stays renewable (`TransactionStorage.RetentionPeriod`). */
export async function retentionPeriod(api: ApiPromise): Promise<number> {
  const query = api.query.transactionStorage?.retentionPeriod;
  if (!query) throw new Error("runtime has no TransactionStorage.RetentionPeriod");
  return Number((await query()).toString());
}

/**
 * Content hash of the entry at `block`/`index`, or null once it is gone. The pallet drops a
 * block's entries after the retention period, after which the data can only be stored again.
 */
export async function storedContentHash(
  api: ApiPromise,
  block: number,
  index: number,
): Promise<string | null> {
  const query = api.query.transactionStorage?.transactions;
  if (!query) throw new Error("runtime has no TransactionStorage.Transactions");
  const entries = (await query(block)).toJSON() as { contentHash: string }[] | null;
  const entry = entries?.[index];
  return entry ? entry.contentHash.toLowerCase() : null;
}

/** TransactionStorage location and content hash from a store or renew inclusion. */
export function storedLocation(
  inclusion: Inclusion,
  method: "Stored" | "Renewed" = "Stored",
): {
  block: number;
  index: number;
  contentHash: string;
} {
  const stored = inclusion.events.find(
    (e) => e.section === "transactionStorage" && e.method === method,
  );
  if (!stored) throw new Error(`no TransactionStorage.${method} event`);
  const [index, contentHash] = stored.data.map((d) => d.toJSON());
  return {
    block: inclusion.blockNumber,
    index: Number(index),
    contentHash: String(contentHash).toLowerCase(),
  };
}
