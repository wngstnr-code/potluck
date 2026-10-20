import { z } from "zod";

/** Columns every row has implicitly; specs must not redeclare them. */
export const IMPLICIT_COLUMNS = ["block", "eventIndex"] as const;

const NAME = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const IDENT = /^[A-Za-z][A-Za-z0-9]*$/;
const COLUMN = /^[a-z][A-Za-z0-9]*$/;
const FIELD_REF = /^\$[a-z_][a-z0-9_]*$/;
const HEX32 = /^0x[0-9a-f]{64}$/;

/**
 * A row value is either a reference to a decoded event field (`"$field_name"`, metadata field
 * names are snake_case) or a literal string.
 */
const rowValue = z.string().min(1);

const substrateEventMatch = z
  .object({
    /** Pallet name as in metadata, e.g. "Balances". Matched case-insensitively. */
    pallet: z.string().regex(IDENT),
    /** Event variant name as in metadata, e.g. "Transfer". */
    event: z.string().regex(IDENT),
    /** Column → value. Columns not set here are null for rows from this match. */
    row: z.record(z.string().regex(COLUMN), rowValue),
    /**
     * Marks the row as setting an absolute value (e.g. Balances.BalanceSet) instead of a delta.
     * Balance reconciliation treats such accounts as resynchronized at that block.
     */
    absolute: z.boolean().optional(),
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
    match: z.array(substrateEventMatch).min(1),
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
export type ReconcileRule = Spec["reconcile"];

export { FIELD_REF };
