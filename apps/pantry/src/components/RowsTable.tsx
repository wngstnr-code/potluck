import type { IndexedRow } from "@potluck/core";
import { direction, fmt, formatAmount, shortHex } from "@potluck/ui/format";
import { Identicon } from "@potluck/ui/Identicon";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { seriesOf } from "../lib/kinds";

export function KindTag({ kind, series }: { kind: string; series: number }) {
  return (
    <span
      className="tag"
      style={{ background: `var(--series-${series})`, color: `var(--on-series-${series})` }}
    >
      {kind}
    </span>
  );
}

const ROW_HEIGHT = 52;

/** Every row, newest first, virtualized so tens of thousands of rows stay smooth. */
export function RowsTable({
  rows,
  filter,
  perspective,
  highlight,
}: {
  rows: readonly IndexedRow[];
  filter: string | null;
  /** A row to mark (e.g. the one an attacker hid). */
  highlight?: IndexedRow;
  /** Address forms of the account being viewed: signs become relative to it. */
  perspective?: ReadonlySet<string>;
}) {
  const visible = useMemo(() => {
    const out: IndexedRow[] = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i] as IndexedRow;
      if (!filter || row.cells.kind === filter) out.push(row);
    }
    return out;
  }, [rows, filter]);
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const highlightIndex = highlight ? visible.indexOf(highlight) : -1;
  useEffect(() => {
    if (highlightIndex >= 0) virtual.scrollToIndex(highlightIndex, { align: "center" });
  }, [highlightIndex, virtual]);
  const items = virtual.getVirtualItems();
  const padTop = items[0]?.start ?? 0;
  const padBottom = virtual.getTotalSize() - (items.at(-1)?.end ?? 0);

  return (
    <div className="scroll" ref={scroller}>
      <table className="rows">
        <thead>
          <tr>
            <th>Account</th>
            <th>Block</th>
            <th>Kind</th>
            <th>Asset</th>
            <th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && (
            <tr className="spacer">
              <td colSpan={5} style={{ height: padTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {items.map((item) => {
            const row = visible[item.index] as IndexedRow;
            const from = row.cells.from ?? undefined;
            const to = row.cells.to ?? undefined;
            const kind = row.cells.kind ?? "?";
            const asset = row.cells.asset ?? undefined;
            const sign = direction(row, perspective);
            // In an account view, show the other side of the row; otherwise the first party.
            const mine = (a: string | undefined) => !!a && !!perspective?.has(a);
            const party = perspective ? (mine(from) ? to : from) : from || to;
            const note = perspective
              ? mine(from) && mine(to)
                ? "between its own addresses"
                : !party
                  ? mine(to)
                    ? "credited"
                    : "debited"
                  : mine(from)
                    ? "sent to"
                    : "received from"
              : from && to
                ? `→ ${shortHex(to)}`
                : to
                  ? "credited"
                  : "debited";
            return (
              <tr
                key={`${row.block}:${row.eventIndex}`}
                className={row === highlight ? "hl" : undefined}
                style={{ height: ROW_HEIGHT }}
              >
                <td>
                  <div className="who">
                    <Identicon account={party} />
                    <div>
                      {perspective && party && <small>{note}</small>}
                      {party ? (
                        <b className="mono">{shortHex(party)}</b>
                      ) : (
                        <b>{note.charAt(0).toUpperCase() + note.slice(1)}</b>
                      )}
                      {!perspective && party && <small>{note}</small>}
                      {!party && <small>no counterparty</small>}
                    </div>
                  </div>
                </td>
                <td className="mono">{fmt(row.block)}</td>
                <td>
                  <KindTag kind={kind} series={seriesOf(kind)} />
                </td>
                <td className="mono muted">{asset === "native" ? "tPOT" : shortHex(asset)}</td>
                <td className={`mono r amt ${sign === "+" ? "pos" : sign === "−" ? "neg" : ""}`}>
                  {sign}
                  {formatAmount(row)}
                </td>
              </tr>
            );
          })}
          {padBottom > 0 && (
            <tr className="spacer">
              <td colSpan={5} style={{ height: padBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
