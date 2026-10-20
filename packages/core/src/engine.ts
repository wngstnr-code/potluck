import { Option } from "@polkadot/types";
import type { Codec } from "@polkadot/types/types";
import { canonicalJson, isLogMatch, type Spec, type SubstrateEventMatch } from "@potluck/spec";
import type { DecodedEvent, EventField } from "./events.js";

/** Cell values: implicit `block`/`eventIndex` are numbers; every spec column is a string or null. */
export type Cell = string | null;

export interface IndexedRow {
  block: number;
  eventIndex: number;
  /** Spec column → value; every declared column is present. */
  cells: Record<string, Cell>;
  /** True for rows from an `absolute` match (e.g. Balances.BalanceSet). */
  absolute: boolean;
}

export interface CompiledSpec {
  spec: Spec;
  /** "pallet.event" (pallet lower-cased) → match. */
  matches: ReadonlyMap<string, SubstrateEventMatch>;
}

const matchKey = (pallet: string, event: string) => `${pallet.toLowerCase()}.${event}`;

export function compileSpec(spec: Spec): CompiledSpec {
  const substrate = spec.match.filter((m): m is SubstrateEventMatch => !isLogMatch(m));
  return { spec, matches: new Map(substrate.map((m) => [matchKey(m.pallet, m.event), m])) };
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
    const match = compiled.matches.get(matchKey(event.pallet, event.event));
    if (!match) continue;
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
      absolute: match.absolute === true,
    });
  }
  return rows.sort((a, b) => a.block - b.block || a.eventIndex - b.eventIndex);
}
