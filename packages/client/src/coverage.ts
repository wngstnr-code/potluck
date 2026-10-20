import type { ManifestEntry } from "./source.js";

export type CoverageSegment =
  | { mode: "snapshot"; fromBlock: number; toBlock: number; entry: ManifestEntry }
  | { mode: "direct"; fromBlock: number; toBlock: number }
  | { mode: "uncovered"; fromBlock: number; toBlock: number };

export interface CoverageOptions {
  /** Gaps longer than this are reported as uncovered instead of synced directly. */
  maxDirectBlocks: number;
}

/**
 * Plans how to obtain [fromBlock, toBlock]: greedily take, at each position, the manifest that
 * covers it and reaches furthest — unflagged manifests first, flagged ones only when nothing else
 * covers the position. Gaps become direct-sync segments, or "uncovered" when longer than
 * maxDirectBlocks (shown to the user as a coverage gap rather than silently taking hours).
 */
export function planCoverage(
  entries: readonly ManifestEntry[],
  range: { fromBlock: number; toBlock: number },
  options: CoverageOptions,
): CoverageSegment[] {
  const segments: CoverageSegment[] = [];
  const gap = (fromBlock: number, toBlock: number) => {
    if (fromBlock > toBlock) return;
    const mode = toBlock - fromBlock + 1 <= options.maxDirectBlocks ? "direct" : "uncovered";
    segments.push({ mode, fromBlock, toBlock });
  };
  let cursor = range.fromBlock;
  while (cursor <= range.toBlock) {
    const covering = entries.filter(
      (e) => e.manifest.range.fromBlock <= cursor && e.manifest.range.toBlock >= cursor,
    );
    const pool = covering.some((e) => e.flags === 0)
      ? covering.filter((e) => e.flags === 0)
      : covering;
    const best = pool.reduce<ManifestEntry | undefined>(
      (a, e) => (!a || e.manifest.range.toBlock > a.manifest.range.toBlock ? e : a),
      undefined,
    );
    if (best) {
      const toBlock = Math.min(best.manifest.range.toBlock, range.toBlock);
      segments.push({ mode: "snapshot", fromBlock: cursor, toBlock, entry: best });
      cursor = toBlock + 1;
      continue;
    }
    const nextStart = entries
      .map((e) => e.manifest.range.fromBlock)
      .filter((b) => b > cursor)
      .reduce((a, b) => Math.min(a, b), range.toBlock + 1);
    gap(cursor, Math.min(nextStart - 1, range.toBlock));
    cursor = nextStart;
  }
  return segments;
}
