import { stringToU8a } from "@polkadot/util";
import { blake2AsHex } from "@polkadot/util-crypto";
import type { Spec } from "./schema.js";

/**
 * Canonical JSON: object keys sorted by UTF-16 code unit order, no whitespace, arrays in order,
 * only strings, safe integers, booleans and null. Floats are rejected so that every
 * implementation produces byte-identical output.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value))
        throw new Error(`canonicalJson: non-integer number ${value}`);
      return String(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof value}`);
  }
}

/** UTF-8 bytes of the canonical spec; this exact blob is what gets stored in TransactionStorage. */
export function canonicalSpecBytes(spec: Spec): Uint8Array {
  return stringToU8a(canonicalJson(spec));
}

/**
 * specHash = blake2b-256 over the canonical spec bytes. It equals the TransactionStorage content
 * hash of the stored spec blob, so one value both identifies and locates the spec.
 */
export function specHash(spec: Spec): `0x${string}` {
  return blake2AsHex(canonicalSpecBytes(spec), 256) as `0x${string}`;
}
