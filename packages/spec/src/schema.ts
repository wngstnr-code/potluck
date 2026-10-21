import { z } from "zod";

/** Columns every row has implicitly; specs must not redeclare them. */
export const IMPLICIT_COLUMNS = ["block", "eventIndex"] as const;

const NAME = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const IDENT = /^[A-Za-z][A-Za-z0-9]*$/;
const COLUMN = /^[a-z][A-Za-z0-9]*$/;
const FIELD_REF = /^\$[A-Za-z_][A-Za-z0-9_]*$/;
const HEX32 = /^0x[0-9a-f]{64}$/;
const H160 = /^0x[0-9a-f]{40}$/;

/**
 * A row value is either a reference (`"$name"`) or a literal string. For pallet events the name is
 * a decoded event field (metadata field names are snake_case); for Revive logs it is an event
 * parameter name or `contract` (the emitting contract's H160).
 */
const rowValue = z.string().min(1);

const substrateEventMatch = z
  .object({
    /** Pallet name as in metadata, e.g. "Balances". Matched case-insensitively. */
    pallet: z.string().regex(IDENT),
    /** Event variant name as in metadata, e.g. "Transfer". */
    event: z.string().regex(IDENT),
    /**
     * Only events whose `field` equals `equals` produce a row. The comparison uses the field's
     * canonical cell: integers as decimal strings, accounts as AccountId32 hex, enums and other
     * values as canonical JSON (e.g. `{"transactionStorage":"StorageFeeHold"}`).
     */
    where: z
      .object({ field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), equals: z.string() })
      .strict()
      .optional(),
    /** Column → value. Columns not set here are null for rows from this match. */
    row: z.record(z.string().regex(COLUMN), rowValue),
    /**
     * How the row affects the reconciled value (default: a delta, debit/credit by `amount`).
     * - "reset": the credit account's value is exactly `amount` at the END of the row's block
     *   (e.g. System.KilledAccount → "0": a reaped account holds nothing, even if a hold vanished
     *   without a Balances event). Same-block rows of that account are part of the reset.
     * - "opaque": the change cannot be expressed (e.g. Balances.BalanceSet sets `free` but not
     *   `reserved`); accounts touched by it are excluded from reconciliation.
     */
    effect: z.enum(["reset", "opaque"]).optional(),
  })
  .strict();

/**
 * An EVM log emitted by a pallet-revive contract. On chain it is a `Revive.ContractEmitted`
 * event inside System.Events, so it is decoded by the same pipeline as pallet events.
 */
const reviveLogMatch = z
  .object({
    /** Solidity event signature with parameter names, e.g.
     *  "Transfer(address indexed from, address indexed to, uint256 value)". */
    log: z.string().min(3),
    /** Restrict to these emitting contracts (lower-case H160); omit for any contract. */
    contracts: z.array(z.string().regex(H160)).min(1).optional(),
    row: z.record(z.string().regex(COLUMN), rowValue),
  })
  .strict();

const balanceDelta = z
  .object({
    type: z.literal("balance-delta"),
    /** Storage holding the per-account value, read at window boundaries on the source chain. */
    storage: z.object({ pallet: z.string().regex(IDENT), item: z.string().regex(IDENT) }).strict(),
    /** Dotted paths into the decoded storage value that are summed, e.g. "data.free". */
    sum: z.array(z.string().regex(/^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/)).min(1),
    /** Column holding the account that loses `amount`. */
    debit: z.string().regex(COLUMN),
    /** Column holding the account that gains `amount`. */
    credit: z.string().regex(COLUMN),
    /** Column holding the amount (decimal string). */
    amount: z.string().regex(COLUMN),
    /** Only rows whose `column` equals `equals` take part (e.g. asset == "native"). */
    when: z
      .object({ column: z.string().regex(COLUMN), equals: z.string() })
      .strict()
      .optional(),
  })
  .strict();

const noReconcile = z.object({ type: z.literal("none") }).strict();

export const specSchema = z
  .object({
    potluck: z.literal(1),
    name: z.string().regex(NAME).max(80),
    description: z.string().max(500).optional(),
    source: z
      .object({
        kind: z.literal("substrate-events"),
        /** Human-readable chain name; the genesis hash is authoritative. */
        chain: z.string().regex(NAME),
        genesisHash: z.string().regex(HEX32),
        fromBlock: z.number().int().nonnegative(),
      })
      .strict(),
    columns: z.array(z.string().regex(COLUMN)).min(1),
    /** Columns holding account ids; used for per-account queries and chunk bloom filters. */
    accounts: z.array(z.string().regex(COLUMN)),
    match: z.array(z.union([substrateEventMatch, reviveLogMatch])).min(1),
    reconcile: z.discriminatedUnion("type", [balanceDelta, noReconcile]),
    chunk: z
      .object({
        maxBlocks: z.number().int().positive(),
        /** Cap on uncompressed NDJSON bytes per chunk (the gzip blob must stay ≤ 8 MB). */
        maxRawBytes: z
          .number()
          .int()
          .positive()
          .max(64 * 1024 * 1024),
      })
      .strict(),
  })
  .strict();

export type Spec = z.infer<typeof specSchema>;
export type SubstrateEventMatch = z.infer<typeof substrateEventMatch>;
export type ReviveLogMatch = z.infer<typeof reviveLogMatch>;
export type Match = SubstrateEventMatch | ReviveLogMatch;

export function isLogMatch(match: Match): match is ReviveLogMatch {
  return "log" in match;
}
export type ReconcileRule = Spec["reconcile"];

export { FIELD_REF };
