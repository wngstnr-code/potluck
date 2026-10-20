import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpec, type Spec } from "@potluck/spec";
import { describe, expect, it } from "vitest";
import { compileSpec, eventsToRows, normalizeField } from "../src/engine.js";
import { decodeEvents } from "../src/events.js";
import { fixtureBlock, polkadotAh, runtime } from "./fixtures.js";

const SPECS = join(import.meta.dirname, "..", "..", "..", "specs");
const balanceSpec = parseSpec(
  JSON.parse(readFileSync(join(SPECS, "polkadot-ah.balance-history.json"), "utf8")),
);
const RECENT = polkadotAh.blocks.at(-1) as (typeof polkadotAh.blocks)[number];
const recentEvents = () =>
  decodeEvents(runtime(RECENT.postStateSpec), RECENT.number, `0x${RECENT.eventsHex}`);

const HEX_ACCOUNT = /^0x[0-9a-f]{64}$/;
const DECIMAL = /^[0-9]+$/;

describe("eventsToRows with the reference balance-history spec on real data", () => {
  const compiled = compileSpec(balanceSpec);

  it("emits one row per matched Balances event with canonical cells", () => {
    const events = recentEvents();
    const matched = events.filter(
      (e) =>
        e.pallet === "Balances" &&
        balanceSpec.match.some((m) => m.event === e.event && m.pallet === e.pallet),
    );
    const rows = eventsToRows(compiled, events);
    expect(rows.length).toBe(matched.length);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.block).toBe(RECENT.number);
      expect(Object.keys(row.cells)).toEqual(balanceSpec.columns);
      expect(row.cells.amount).toMatch(DECIMAL);
      if (row.cells.from !== null) expect(row.cells.from).toMatch(HEX_ACCOUNT);
      if (row.cells.to !== null) expect(row.cells.to).toMatch(HEX_ACCOUNT);
      expect(row.cells.from !== null || row.cells.to !== null).toBe(true);
    }
  });

  it("maps debit-only and credit-only events correctly", () => {
    const rows = eventsToRows(compiled, recentEvents());
    for (const row of rows) {
      if (row.cells.kind === "Withdraw") expect(row.cells.to).toBeNull();
      if (row.cells.kind === "Deposit") expect(row.cells.from).toBeNull();
      if (row.cells.kind === "Transfer") {
        expect(row.cells.from).not.toBeNull();
        expect(row.cells.to).not.toBeNull();
      }
    }
  });

  it("keeps rows in (block, eventIndex) order and skips unmatched events", () => {
    const events = recentEvents();
    const rows = eventsToRows(compiled, [...events].reverse());
    expect(rows.map((r) => r.eventIndex)).toEqual(
      [...rows.map((r) => r.eventIndex)].sort((a, b) => a - b),
    );
    expect(
      eventsToRows(
        compiled,
        events.filter((e) => e.pallet === "System"),
      ),
    ).toEqual([]);
  });

  it("decodes Balances rows in the set_code block with the executing runtime", () => {
    const block = fixtureBlock(16_946_479);
    const rows = eventsToRows(
      compiled,
      decodeEvents(runtime(2002001), block.number, `0x${block.eventsHex}`),
    );
    expect(rows.some((r) => r.cells.kind === "Transfer")).toBe(true);
  });
});

describe("eventsToRows edge cases", () => {
  it("sets literal values and nulls for unset columns", () => {
    const spec: Spec = {
      ...balanceSpec,
      columns: ["kind", "from", "to", "amount", "note"],
      match: [
        {
          pallet: "Balances",
          event: "Withdraw",
          row: { kind: "fee", from: "$who", amount: "$amount" },
        },
      ],
    };
    const rows = eventsToRows(compileSpec(spec), recentEvents());
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.cells.kind).toBe("fee");
      expect(row.cells.note).toBeNull();
      expect(row.absolute).toBe(false);
    }
  });

  it("flags rows from absolute matches", () => {
    const spec: Spec = {
      ...balanceSpec,
      match: [{ pallet: "Balances", event: "Withdraw", row: { from: "$who" }, absolute: true }],
    };
    expect(eventsToRows(compileSpec(spec), recentEvents()).every((r) => r.absolute)).toBe(true);
  });

  it("throws when a referenced field does not exist in the runtime", () => {
    const spec: Spec = {
      ...balanceSpec,
      match: [{ pallet: "Balances", event: "Withdraw", row: { from: "$payer" } }],
    };
    expect(() => eventsToRows(compileSpec(spec), recentEvents())).toThrow('no field "payer"');
  });

  it("matches pallet names case-insensitively", () => {
    const spec: Spec = {
      ...balanceSpec,
      match: [{ pallet: "balances", event: "Withdraw", row: { from: "$who", amount: "$amount" } }],
    };
    expect(eventsToRows(compileSpec(spec), recentEvents()).length).toBeGreaterThan(0);
  });
});

describe("normalizeField", () => {
  const registry = runtime(RECENT.postStateSpec).registry;
  const account = `0x${"ab".repeat(32)}`;
  const field = (type: string, value: unknown, typeName = "") => ({
    typeName,
    value: registry.createType(type, value),
  });

  it("normalizes accounts, options, integers, hashes and booleans", () => {
    expect(normalizeField(field("AccountId32", account, "T::AccountId"))).toBe(account);
    expect(normalizeField(field("Option<AccountId32>", null, "Option<T::AccountId>"))).toBeNull();
    expect(normalizeField(field("Option<AccountId32>", account, "Option<T::AccountId>"))).toBe(
      account,
    );
    expect(normalizeField(field("u32", 7))).toBe("7");
    expect(normalizeField(field("u128", "340282366920938463463374607431768211455"))).toBe(
      "340282366920938463463374607431768211455",
    );
    expect(normalizeField(field("Compact<u64>", 42))).toBe("42");
    expect(normalizeField(field("H256", `0x${"01".repeat(32)}`))).toBe(`0x${"01".repeat(32)}`);
    expect(normalizeField(field("[u8;4]", "0xdeadbeef"))).toBe("0xdeadbeef");
    expect(normalizeField(field("bool", true))).toBe("true");
  });

  it("serializes other types as canonical JSON", () => {
    expect(normalizeField(field("(u8,u16)", [1, 2]))).toBe("[1,2]");
  });
});
