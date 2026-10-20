import { blake2AsHex } from "@polkadot/util-crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, parseSpec, type Spec, specHash, validateSpec } from "../src/index.js";

function baseSpec(): Spec {
  return {
    potluck: 1,
    name: "polkadot-ah.balance-history",
    source: {
      kind: "substrate-events",
      chain: "polkadot-asset-hub",
      genesisHash: "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f",
      fromBlock: 11405259,
    },
    columns: ["kind", "from", "to", "amount"],
    accounts: ["from", "to"],
    match: [
      {
        pallet: "Balances",
        event: "Transfer",
        row: { kind: "Transfer", from: "$from", to: "$to", amount: "$amount" },
      },
      {
        pallet: "Balances",
        event: "Withdraw",
        row: { kind: "Withdraw", from: "$who", amount: "$amount" },
      },
    ],
    reconcile: {
      type: "balance-delta",
      storage: { pallet: "System", item: "Account" },
      sum: ["data.free", "data.reserved"],
      debit: "from",
      credit: "to",
      amount: "amount",
    },
    chunk: { maxBlocks: 100000, maxRawBytes: 32_000_000 },
  };
}

function errorsOf(input: unknown): string[] {
  const result = validateSpec(input);
  return result.ok ? [] : result.errors;
}

describe("canonicalJson", () => {
  it("sorts keys recursively and drops whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, "x"], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,"x"]},"b":1}',
    );
  });

  it("omits undefined properties", () => {
    expect(canonicalJson({ a: undefined, b: true })).toBe('{"b":true}');
  });

  it("rejects floats and unsafe integers", () => {
    expect(() => canonicalJson({ a: 1.5 })).toThrow(/non-integer/);
    expect(() => canonicalJson({ a: 2 ** 60 })).toThrow(/non-integer/);
  });
});

describe("specHash", () => {
  it("is blake2b-256 of the canonical bytes", () => {
    const spec = baseSpec();
    expect(specHash(spec)).toBe(blake2AsHex(canonicalJson(spec), 256));
  });

  it("does not depend on key order", () => {
    const spec = baseSpec();
    const reordered = Object.fromEntries(Object.entries(spec).reverse()) as Spec;
    expect(specHash(reordered)).toBe(specHash(spec));
  });

  it("changes when any field changes", () => {
    const a = baseSpec();
    const b = baseSpec();
    b.source.fromBlock += 1;
    expect(specHash(a)).not.toBe(specHash(b));
  });
});

describe("validateSpec", () => {
  it("accepts a well-formed spec", () => {
    expect(validateSpec(baseSpec())).toEqual({ ok: true, spec: baseSpec() });
    expect(parseSpec(baseSpec()).name).toBe("polkadot-ah.balance-history");
  });

  it("rejects unknown properties and bad formats", () => {
    expect(errorsOf({ ...baseSpec(), extra: 1 })).not.toEqual([]);
    expect(errorsOf({ ...baseSpec(), name: "Bad Name" })).not.toEqual([]);
    expect(
      errorsOf({ ...baseSpec(), source: { ...baseSpec().source, genesisHash: "0x12" } }),
    ).not.toEqual([]);
    expect(errorsOf({ ...baseSpec(), potluck: 2 })).not.toEqual([]);
  });

  it("rejects implicit and duplicate columns", () => {
    expect(errorsOf({ ...baseSpec(), columns: ["block", "kind"] })).toContain(
      'columns: "block" is implicit and must not be declared',
    );
    const dup = baseSpec();
    dup.columns = ["kind", "kind", "from", "to", "amount"];
    expect(errorsOf(dup)).toContain("columns: duplicate column name");
  });

  it("rejects accounts and row columns that are not declared", () => {
    const spec = baseSpec();
    spec.accounts = ["from", "owner"];
    spec.match[0] = {
      pallet: "Balances",
      event: "Transfer",
      row: { kind: "Transfer", payer: "$from" },
    };
    const errors = errorsOf(spec);
    expect(errors).toContain('accounts: "owner" is not a declared column');
    expect(errors).toContain('match[0].row: "payer" is not a declared column');
  });

  it("rejects malformed field references and duplicate matches", () => {
    const spec = baseSpec();
    spec.match[1] = { pallet: "balances", event: "Transfer", row: { from: "$From-Account" } };
    const errors = errorsOf(spec);
    expect(errors).toContain('match[1].row.from: invalid field reference "$From-Account"');
    expect(errors).toContain("match[1]: duplicate match for balances.Transfer");
  });

  it("checks reconcile columns", () => {
    const spec = baseSpec();
    if (spec.reconcile.type !== "balance-delta") throw new Error("unreachable");
    spec.reconcile.amount = "value";
    spec.accounts = ["from"];
    const errors = errorsOf(spec);
    expect(errors).toContain('reconcile.amount: "value" is not a declared column');
    expect(errors).toContain("reconcile: debit and credit columns must be listed in accounts");
  });

  it("caps chunk size", () => {
    const spec = baseSpec();
    spec.chunk.maxRawBytes = 128 * 1024 * 1024;
    expect(errorsOf(spec)).not.toEqual([]);
  });

  it("parseSpec throws with every error", () => {
    expect(() => parseSpec({ ...baseSpec(), columns: ["block"] })).toThrow(/invalid spec/);
  });
});
