import { blake2AsHex } from "@polkadot/util-crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  parseLogSignature,
  parseSpec,
  type Spec,
  specHash,
  validateSpec,
} from "../src/index.js";

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

describe("revive log matches", () => {
  const transfer = "Transfer(address indexed from, address indexed to, uint256 value)";
  const withLog = (log: string, row: Record<string, string>, extra: object = {}): Spec => ({
    ...baseSpec(),
    columns: ["kind", "asset", "from", "to", "amount"],
    match: [{ log, row, ...extra }],
  });

  it("accepts a named Solidity event with $contract and parameter references", () => {
    const spec = withLog(transfer, {
      kind: "Erc20Transfer",
      asset: "$contract",
      from: "$from",
      to: "$to",
      amount: "$value",
    });
    expect(validateSpec(spec).ok).toBe(true);
    expect(
      validateSpec(withLog(transfer, { kind: "x" }, { contracts: [`0x${"ab".repeat(20)}`] })).ok,
    ).toBe(true);
  });

  it("parses selectors and indexed counts", () => {
    const erc20 = parseLogSignature(transfer);
    const erc721 = parseLogSignature(
      "Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    );
    if (typeof erc20 === "string" || typeof erc721 === "string") throw new Error("parse failed");
    expect(erc20.selector).toBe(
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    );
    expect(erc721.selector).toBe(erc20.selector);
    expect([erc20.indexed, erc721.indexed]).toEqual([2, 3]);
  });

  it("rejects invalid signatures, unnamed or reserved parameters and unknown references", () => {
    expect(errorsOf(withLog("Transfer(address", { kind: "x" }))[0]).toMatch(
      /invalid event signature/,
    );
    expect(errorsOf(withLog("Transfer(address indexed, uint256)", { kind: "x" }))).toContain(
      "match[0].log: every event parameter needs a name",
    );
    expect(errorsOf(withLog("Moved(address contract)", { kind: "x" }))).toContain(
      'match[0].log: "contract" is reserved for the emitting contract',
    );
    expect(errorsOf(withLog(transfer, { amount: "$amount" }))).toContain(
      `match[0].row: "$amount" is not a parameter of ${transfer}`,
    );
  });

  it("rejects duplicate log matches but allows ERC-721 next to ERC-20", () => {
    const dup = withLog(transfer, { kind: "a" });
    dup.match.push({ log: transfer, row: { kind: "b" } });
    expect(errorsOf(dup)).toContain(`match[1]: duplicate match for log ${transfer}`);
    const both = withLog(transfer, { kind: "a" });
    both.match.push({
      log: "Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
      row: { kind: "b" },
    });
    expect(validateSpec(both).ok).toBe(true);
  });

  it("validates the reconcile `when` column", () => {
    const spec = baseSpec();
    if (spec.reconcile.type !== "balance-delta") throw new Error("unreachable");
    spec.reconcile.when = { column: "asset", equals: "native" };
    expect(errorsOf(spec)).toContain('reconcile.when: "asset" is not a declared column');
  });
});
