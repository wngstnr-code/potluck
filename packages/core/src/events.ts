import type { Codec } from "@polkadot/types/types";
import { xxhashAsHex } from "@polkadot/util-crypto";
import type { RpcClient } from "./rpc.js";
import { type DecodingRuntime, hexToBytes } from "./runtime.js";

export const SYSTEM_EVENTS_KEY = `${xxhashAsHex("System", 128)}${xxhashAsHex("Events", 128).slice(2)}`;

export interface EventField {
  /** Metadata field name (snake_case), e.g. "friend_group_index". */
  name: string;
  /** Metadata type name, e.g. "T::AccountId". */
  typeName: string;
  value: Codec;
}

export interface DecodedEvent {
  block: number;
  /** Position in the block's System.Events vector. */
  eventIndex: number;
  /** Pallet name as declared in metadata, e.g. "Balances". */
  pallet: string;
  /** Event variant name, e.g. "Transfer". */
  event: string;
  fields: EventField[];
}

interface RawEventRecord {
  event: {
    index: { toU8a(): Uint8Array };
    method: string;
    data: Codec[];
    meta: {
      fields: {
        name: { toString(): string; isSome?: boolean };
        typeName: { toString(): string };
      }[];
    };
  };
}

/**
 * Decodes the SCALE `System.Events` value of `block` with `runtime`, which MUST be the block's
 * executing runtime (see RuntimeMap.executingVersion). Throws unless every byte is consumed,
 * so a wrong runtime can never produce silently wrong rows.
 */
export function decodeEvents(
  runtime: DecodingRuntime,
  block: number,
  raw: Uint8Array | string,
): DecodedEvent[] {
  const bytes = typeof raw === "string" ? hexToBytes(raw) : raw;
  if (bytes.length === 0) return [];
  const type = runtime.registry.createLookupType(runtime.storageTypeId("System", "Events"));
  const records = runtime.registry.createType(type, bytes) as unknown as RawEventRecord[] & {
    encodedLength: number;
  };
  if (records.encodedLength !== bytes.length) {
    throw new Error(
      `block #${block}: decoded ${records.encodedLength} of ${bytes.length} bytes with spec ${runtime.specVersion}`,
    );
  }
  return records.map((record, eventIndex) => {
    const palletIndex = record.event.index.toU8a()[0] as number;
    const pallet = runtime.palletNames.get(palletIndex);
    if (!pallet) throw new Error(`block #${block}: unknown pallet index ${palletIndex}`);
    const fields = record.event.meta.fields.map((f, i) => ({
      name: f.name.toString(),
      typeName: f.typeName.toString(),
      value: record.event.data[i] as Codec,
    }));
    return { block, eventIndex, pallet, event: record.event.method, fields };
  });
}

/** Fetches the raw `System.Events` storage of a block (empty when the block emitted none). */
export async function fetchRawEvents(client: RpcClient, blockHash: string): Promise<Uint8Array> {
  const raw = await client.send<string | null>("state_getStorage", [SYSTEM_EVENTS_KEY, blockHash]);
  return raw ? hexToBytes(raw) : new Uint8Array();
}
