import { parseAbiItem, toEventSelector } from "viem";
import { FIELD_REF, IMPLICIT_COLUMNS, isLogMatch, type Spec, specSchema } from "./schema.js";

export type ValidationResult = { ok: true; spec: Spec } | { ok: false; errors: string[] };

/** Validates shape (schema) and cross-field rules that a schema cannot express. */
export function validateSpec(input: unknown): ValidationResult {
  const parsed = specSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const spec = parsed.data;
  const errors: string[] = [];
  const columns = new Set(spec.columns);

  if (columns.size !== spec.columns.length) errors.push("columns: duplicate column name");
  for (const implicit of IMPLICIT_COLUMNS) {
    if (columns.has(implicit))
      errors.push(`columns: "${implicit}" is implicit and must not be declared`);
  }
  for (const account of spec.accounts) {
    if (!columns.has(account)) errors.push(`accounts: "${account}" is not a declared column`);
  }

  const seen = new Set<string>();
  spec.match.forEach((m, i) => {
    let key: string;
    let label: string;
    if (isLogMatch(m)) {
      const parsed = parseLogSignature(m.log);
      if (typeof parsed === "string") {
        errors.push(`match[${i}].log: ${parsed}`);
        return;
      }
      key = `log:${parsed.selector}:${parsed.indexed}`;
      label = `log ${m.log}`;
      const allowed = new Set(["contract", ...parsed.params]);
      for (const value of Object.values(m.row)) {
        if (FIELD_REF.test(value) && !allowed.has(value.slice(1))) {
          errors.push(`match[${i}].row: "${value}" is not a parameter of ${m.log}`);
        }
      }
    } else {
      key = `${m.pallet.toLowerCase()}.${m.event}`;
      label = `${m.pallet}.${m.event}`;
    }
    if (seen.has(key)) errors.push(`match[${i}]: duplicate match for ${label}`);
    seen.add(key);
    for (const [column, value] of Object.entries(m.row)) {
      if (!columns.has(column))
        errors.push(`match[${i}].row: "${column}" is not a declared column`);
      if (value.startsWith("$") && !FIELD_REF.test(value)) {
        errors.push(`match[${i}].row.${column}: invalid field reference "${value}"`);
      }
    }
  });

  if (spec.reconcile.type === "balance-delta") {
    const r = spec.reconcile;
    for (const [role, column] of [
      ["debit", r.debit],
      ["credit", r.credit],
      ["amount", r.amount],
    ] as const) {
      if (!columns.has(column))
        errors.push(`reconcile.${role}: "${column}" is not a declared column`);
    }
    if (!spec.accounts.includes(r.debit) || !spec.accounts.includes(r.credit)) {
      errors.push("reconcile: debit and credit columns must be listed in accounts");
    }
    if (r.when && !columns.has(r.when.column)) {
      errors.push(`reconcile.when: "${r.when.column}" is not a declared column`);
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec };
}

export interface ParsedLogSignature {
  /** keccak256 of the canonical signature, i.e. topics[0]. */
  selector: `0x${string}`;
  /** Number of indexed parameters (ERC-20 and ERC-721 Transfer share a selector but differ here). */
  indexed: number;
  params: string[];
}

/** Parses a Solidity event signature with named parameters; returns an error string if invalid. */
export function parseLogSignature(signature: string): ParsedLogSignature | string {
  try {
    const item = parseAbiItem(`event ${signature}`);
    if (item.type !== "event") return "not an event signature";
    const params = item.inputs.map((input) => input.name ?? "");
    if (params.some((p) => p === "")) return "every event parameter needs a name";
    if (params.includes("contract")) return '"contract" is reserved for the emitting contract';
    return {
      selector: toEventSelector(item),
      indexed: item.inputs.filter((input) => "indexed" in input && input.indexed).length,
      params,
    };
  } catch (error) {
    return `invalid event signature (${(error as Error).message.split("\n")[0]})`;
  }
}

/** Like validateSpec but throws with all errors. */
export function parseSpec(input: unknown): Spec {
  const result = validateSpec(input);
  if (!result.ok) throw new Error(`invalid spec:\n  ${result.errors.join("\n  ")}`);
  return result.spec;
}
