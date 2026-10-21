import { Option } from "@polkadot/types";
import type { Codec } from "@polkadot/types/types";
import {
  canonicalJson,
  isLogMatch,
  type ReviveLogMatch,
  type Spec,
  type SubstrateEventMatch,
} from "@potluck/spec";
import { type AbiEvent, decodeEventLog, type Hex, parseAbiItem, toEventSelector } from "viem";
import type { DecodedEvent, EventField } from "./events.js";

/** Cell values: implicit `block`/`eventIndex` are numbers; every spec column is a string or null. */
export type Cell = string | null;

export type RowEffect = "delta" | "reset" | "opaque";

export interface IndexedRow {
  block: number;
  eventIndex: number;
  /** Spec column → value; every declared column is present. */
  cells: Record<string, Cell>;
  /** Reconciliation effect: a delta (default), a reset at block end, or opaque. */
  effect: RowEffect;
}

interface CompiledLogMatch {
  match: ReviveLogMatch;
  abi: AbiEvent;
  indexed: number;
  contracts: ReadonlySet<string> | null;
}

export interface CompiledSpec {
  spec: Spec;
  /** "pallet.event" (pallet lower-cased) → match. */
  matches: ReadonlyMap<string, SubstrateEventMatch>;
  /** topics[0] → log matches with that selector (ERC-20 and ERC-721 Transfer share one). */
  logMatches: ReadonlyMap<string, readonly CompiledLogMatch[]>;
}

const matchKey = (pallet: string, event: string) => `${pallet.toLowerCase()}.${event}`;

export function compileSpec(spec: Spec): CompiledSpec {
  const matches = new Map<string, SubstrateEventMatch>();
  const logMatches = new Map<string, CompiledLogMatch[]>();
  for (const m of spec.match) {
    if (!isLogMatch(m)) {
      matches.set(matchKey(m.pallet, m.event), m);
      continue;
    }
    const abi = parseAbiItem(`event ${m.log}`) as AbiEvent;
    const selector = toEventSelector(abi);
    const list = logMatches.get(selector) ?? [];
    list.push({
      match: m,
      abi,
      indexed: abi.inputs.filter((i) => i.indexed).length,
      contracts: m.contracts ? new Set(m.contracts) : null,
    });
    logMatches.set(selector, list);
  }
  return { spec, matches, logMatches };
}

/** Normalizes a viem-decoded ABI value to a canonical cell (addresses and hex lower-cased). */
function normalizeAbiValue(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.startsWith("0x") ? value.toLowerCase() : value;
  return canonicalJson(
    JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))),
  );
}

/**
 * Decodes a `Revive.ContractEmitted` event against the spec's log matches. Returns the first
 * match whose selector, indexed-topic count and contract filter fit and that decodes strictly.
 */
function matchLog(
  compiled: CompiledSpec,
  event: DecodedEvent,
): { match: ReviveLogMatch; values: Record<string, Cell> } | undefined {
  const field = (name: string) => event.fields.find((f) => f.name === name)?.value;
  const contractCodec = field("contract");
  const dataCodec = field("data");
  const topicsCodec = field("topics") as unknown as { toHex(): string }[] | undefined;
  if (!contractCodec || !dataCodec || !topicsCodec) return undefined;
  const topics = [...topicsCodec].map((t) => t.toHex() as Hex);
  const candidates = topics[0] ? compiled.logMatches.get(topics[0]) : undefined;
  if (!candidates) return undefined;
  const contract = contractCodec.toHex().toLowerCase();
  for (const candidate of candidates) {
    if (topics.length - 1 !== candidate.indexed) continue;
    if (candidate.contracts && !candidate.contracts.has(contract)) continue;
    try {
      const decoded = decodeEventLog({
        abi: [candidate.abi],
        data: dataCodec.toHex() as Hex,
        topics: topics as [Hex, ...Hex[]],
        strict: true,
      });
      const values: Record<string, Cell> = { contract };
      for (const [name, value] of Object.entries(decoded.args as Record<string, unknown>)) {
        values[name] = normalizeAbiValue(value);
      }
      return { match: candidate.match, values };
    } catch {
      // Same selector but a different shape (e.g. malformed data): not this match.
    }
  }
  return undefined;
}

/**
 * Normalizes a decoded field to a canonical cell:
 * - Option::None → null, Option::Some(x) → normalize(x);
 * - account ids → 0x-prefixed AccountId32 hex (never SS58: spike S4);
 * - integers → decimal string;
 * - fixed byte arrays / hashes → 0x hex;
 * - booleans → "true" / "false";
 * - anything else → canonical JSON of the codec's JSON form.
 */
export function normalizeField(field: Pick<EventField, "typeName" | "value">): Cell {
  return normalizeCodec(field.value, field.typeName);
}

function normalizeCodec(value: Codec, typeName: string): Cell {
  if (value instanceof Option)
    return value.isSome ? normalizeCodec(value.unwrap(), typeName) : null;
  const raw = value.toRawType();
  if (/AccountId/.test(typeName) || raw === "AccountId32" || raw === "AccountId")
    return value.toHex();
  if (/^(u|i)(8|16|32|64|128|256)$/.test(raw) || /^Compact<(u|i)\d+>$/.test(raw)) {
    return (value as unknown as { toBigInt(): bigint }).toBigInt().toString();
  }
  if (raw === "bool") return (value as unknown as { isTrue: boolean }).isTrue ? "true" : "false";
  if (/^\[u8;\d+\]$/.test(raw) || /^H(160|256|512)$/.test(raw)) return value.toHex();
  try {
    return canonicalJson(value.toJSON());
  } catch {
    return value.toString();
  }
}

/**
 * Projects decoded events of one or more blocks into rows, in (block, eventIndex) order.
 * Throws if a matched event lacks a referenced field, i.e. the spec no longer fits the runtime.
 */
export function eventsToRows(
  compiled: CompiledSpec,
  events: readonly DecodedEvent[],
): IndexedRow[] {
  const { spec } = compiled;
  const rows: IndexedRow[] = [];
  for (const event of events) {
    if (
      compiled.logMatches.size > 0 &&
      event.pallet === "Revive" &&
      event.event === "ContractEmitted"
    ) {
      const log = matchLog(compiled, event);
      if (log) {
        const cells: Record<string, Cell> = {};
        for (const column of spec.columns) cells[column] = null;
        for (const [column, value] of Object.entries(log.match.row)) {
          cells[column] = value.startsWith("$") ? (log.values[value.slice(1)] ?? null) : value;
        }
        rows.push({ block: event.block, eventIndex: event.eventIndex, cells, effect: "delta" });
        continue;
      }
    }
    const match = compiled.matches.get(matchKey(event.pallet, event.event));
    if (!match) continue;
    if (match.where) {
      const { field: name, equals } = match.where;
      const field = event.fields.find((f) => f.name === name);
      if (!field) {
        throw new Error(
          `block #${event.block} ${event.pallet}.${event.event}: no field "${name}" (fields: ${event.fields.map((f) => f.name).join(", ")})`,
        );
      }
      if (normalizeField(field) !== equals) continue;
    }
    const cells: Record<string, Cell> = {};
    for (const column of spec.columns) cells[column] = null;
    for (const [column, value] of Object.entries(match.row)) {
      if (!value.startsWith("$")) {
        cells[column] = value;
        continue;
      }
      const name = value.slice(1);
      const field = event.fields.find((f) => f.name === name);
      if (!field) {
        throw new Error(
          `block #${event.block} ${event.pallet}.${event.event}: no field "${name}" (fields: ${event.fields.map((f) => f.name).join(", ")})`,
        );
      }
      cells[column] = normalizeField(field);
    }
    rows.push({
      block: event.block,
      eventIndex: event.eventIndex,
      cells,
      effect: match.effect ?? "delta",
    });
  }
  return rows.sort((a, b) => a.block - b.block || a.eventIndex - b.eventIndex);
}
