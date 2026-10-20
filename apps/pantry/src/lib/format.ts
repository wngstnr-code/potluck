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

export function formatAmount(row: IndexedRow): string {
  if (row.cells.tokenId) return `#${row.cells.tokenId}`;
  const raw = row.cells.amount ?? "0";
  if (row.cells.asset !== "native") return BigInt(raw).toLocaleString("en-US");
  const v = BigInt(raw);
  const scale = 10n ** BigInt(NATIVE_DECIMALS);
  const whole = v / scale;
  const digits = (v % scale).toString().padStart(NATIVE_DECIMALS, "0");
  const first = digits.search(/[1-9]/);
  const keep = whole === 0n && first >= 4 ? Math.min(NATIVE_DECIMALS, first + 2) : 4;
  return `${whole.toLocaleString("en-US")}.${digits.slice(0, keep)}`;
}

/** "+" when the row only credits, "−" when it only debits, "" for a transfer between two accounts. */
export function direction(row: IndexedRow): "+" | "−" | "" {
  const { from, to, amount, tokenId } = row.cells;
  if (!tokenId && (amount === "0" || amount == null)) return "";
  if (from && to) return "";
  if (to) return "+";
  if (from) return "−";
  return "";
}
