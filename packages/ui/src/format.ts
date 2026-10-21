import type { IndexedRow } from "@potluck/core";

export const fmt = (n: number) => n.toLocaleString("en-US");

export const shortHex = (hex: string | undefined) =>
  hex ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : "—";

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${Math.round((ms % 60_000) / 1_000)} s`;
}

/** Native tPOT has 14 decimals. Token decimals are not part of the event, so tokens show base units. */
const NATIVE_DECIMALS = 14;

/**
 * A native amount in planck with up to 4 decimals (more when the value is tiny). Defaults to tPOT;
 * pass the chain's decimals for other chains (DOT has 10).
 */
export function formatNative(v: bigint, decimals = NATIVE_DECIMALS): string {
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const digits = (abs % scale).toString().padStart(decimals, "0");
  const first = digits.search(/[1-9]/);
  const keep = whole === 0n && first >= 4 ? Math.min(decimals, first + 2) : 4;
  return `${negative ? "−" : ""}${whole.toLocaleString("en-US")}.${digits.slice(0, keep)}`;
}

/** True for native-currency rows: `asset` is "native", or the spec has no asset column. */
export const isNative = (row: IndexedRow) =>
  row.cells.asset === "native" || row.cells.asset === undefined;

export function formatAmount(row: IndexedRow, decimals = NATIVE_DECIMALS): string {
  if (row.cells.tokenId) return `#${row.cells.tokenId}`;
  const raw = row.cells.amount ?? "0";
  if (!isNative(row)) return BigInt(raw).toLocaleString("en-US");
  return formatNative(BigInt(raw), decimals);
}

/**
 * "+" when the row only credits, "−" when it only debits, "" for a transfer between two accounts.
 * With a perspective (an account's address forms), the sign is relative to that account.
 */
export function direction(row: IndexedRow, perspective?: ReadonlySet<string>): "+" | "−" | "" {
  const { from, to, amount, tokenId } = row.cells;
  if (!tokenId && (amount === "0" || amount == null)) return "";
  if (perspective) {
    if (to && perspective.has(to) && !(from && perspective.has(from))) return "+";
    if (from && perspective.has(from) && !(to && perspective.has(to))) return "−";
    return "";
  }
  if (from && to) return "";
  if (to) return "+";
  if (from) return "−";
  return "";
}
