import { useEffect, useMemo, useState } from "react";
import { ActivityPanel, KindsPanel, ProofBar, VerificationPanel } from "./components/Panels";
import { RowsTable } from "./components/RowsTable";
import { UNIFIED_SPEC } from "./config";
import { fmt, formatDuration } from "./lib/format";
import { accountsOf, activity, kindStats } from "./lib/kinds";
import { useHistory } from "./lib/useHistory";

export function Overview() {
  const history = useHistory(UNIFIED_SPEC);
  const [filter, setFilter] = useState<string | null>(null);
  const [, tick] = useState(0);
  const loading = !history.source && history.phase !== "error";
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, [loading]);
  const { rows } = history;
  const kinds = useMemo(() => kindStats(rows), [rows]);
  const p = history.progress;
  const toBlock =
    history.head ?? (p?.unit === "blocks" ? history.fromBlock + p.total - 1 : history.fromBlock);
  const act = useMemo(
    () => activity(rows, history.fromBlock, Math.max(toBlock, history.fromBlock + 1)),
    [rows, history.fromBlock, toBlock],
  );
  const accounts = useMemo(() => accountsOf(rows), [rows]);
  const native = useMemo(() => rows.filter((r) => r.cells.asset === "native").length, [rows]);
  const recent = act.buckets.slice(-12);
  const recentMax = Math.max(1, ...recent.map((b) => b.native + b.token));
  const r = history.reconciliation;
  const elapsed = history.source?.ms ?? Date.now() - history.startedAt;

  return (
    <>
      <div className="head">
        <div>
          <h1>Unified history, verified</h1>
          <p>
            Native balances and EVM + PVM token transfers on Portaldot V3, from genesis. Loaded and
            checked in this browser.
          </p>
        </div>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="lbl">Rows indexed</span>
          <span className="big mono">{fmt(rows.length)}</span>
          <div className="minibars">
            {recent.map((b) => (
              <i
                key={b.fromBlock}
                style={{ height: `${Math.max(6, ((b.native + b.token) / recentMax) * 100)}%` }}
              />
            ))}
          </div>
        </div>
        <div className="tile">
          <span className="lbl">Account checks reconciled</span>
          <span className="big mono">
            {r ? fmt(r.checks - r.failed.length) : "—"}
            <small> / {r ? fmt(r.checks) : "—"}</small>
          </span>
          <span className="sub">
            {r ? (
              r.ok ? (
                <>
                  <b className="pos">Exact</b> at every window edge
                </>
              ) : (
                <b className="neg">{fmt(r.failed.length)} mismatches</b>
              )
            ) : history.reconcileProgress ? (
              `checking window ${history.reconcileProgress.done} of ${history.reconcileProgress.total}`
            ) : (
              "runs after loading"
            )}
          </span>
        </div>
        <div className="tile yellow">
          <span className="lbl">
            {history.source ? `Loaded by ${history.source.mode} sync` : "Loading"}
          </span>
          <span className="big mono">{formatDuration(elapsed)}</span>
          <div className="meter">
            <div className="track">
              <i
                style={{
                  width: `${history.source ? 100 : p ? (p.done / Math.max(p.total, 1)) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="sub">
              {history.source
                ? `${fmt((history.verifiedTo ?? history.fromBlock) - history.fromBlock + 1)} blocks · ${history.source.chunks ? `${history.source.chunks} chunks` : "no snapshot published yet"}`
                : p
                  ? `${fmt(p.done)} of ${fmt(p.total)} ${p.unit}`
                  : history.phase === "connecting"
                    ? "connecting to Portaldot…"
                    : "reading runtime versions…"}
            </span>
          </div>
        </div>
        <div className="tile blue">
          <span className="lbl">Accounts with history</span>
          <span className="big mono">{fmt(accounts)}</span>
          <span className="sub">
            {fmt(native)} native rows · {fmt(rows.length - native)} token rows
          </span>
        </div>
      </div>

      <div className="content">
        <section className="panel">
          <div className="ph">
            <h2>Indexed rows</h2>
            <span>
              {filter ? `${filter} · ` : ""}newest first · {fmt(rows.length)} rows
              {history.tailRows > 0 ? ` · ${fmt(history.tailRows)} from the live tail` : ""}
            </span>
          </div>
          <RowsTable rows={rows} filter={filter} />
          <ProofBar history={history} />
        </section>
        <aside className="side">
          <VerificationPanel history={history} />
          <KindsPanel kinds={kinds} total={rows.length} filter={filter} onFilter={setFilter} />
          <ActivityPanel
            buckets={act.buckets}
            size={act.size}
            fromBlock={history.fromBlock}
            toBlock={toBlock}
            native={native}
            token={rows.length - native}
          />
        </aside>
      </div>
    </>
  );
}
