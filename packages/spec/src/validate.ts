import { FIELD_REF, IMPLICIT_COLUMNS, type Spec, specSchema } from "./schema.js";

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
    const key = `${m.pallet.toLowerCase()}.${m.event}`;
    if (seen.has(key)) errors.push(`match[${i}]: duplicate match for ${m.pallet}.${m.event}`);
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
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec };
}

/** Like validateSpec but throws with all errors. */
export function parseSpec(input: unknown): Spec {
  const result = validateSpec(input);
  if (!result.ok) throw new Error(`invalid spec:\n  ${result.errors.join("\n  ")}`);
  return result.spec;
}
