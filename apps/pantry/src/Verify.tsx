import { type FormEvent, useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { Identicon } from "./components/Identicon";
import { ActivityPanel } from "./components/Panels";
import { RowsTable } from "./components/RowsTable";
import { PORTALDOT } from "./config";
import { type AccountReport, activeAccounts, verifyAccount } from "./lib/account";
import { fmt, formatDuration, formatNative, shortHex } from "./lib/format";
import { useSharedHistory } from "./lib/HistoryContext";
import { activity } from "./lib/kinds";
import type { HistoryState } from "./lib/useHistory";

type Run =
  | { status: "idle" }
  | { status: "running"; input: string }
  | { status: "done"; report: AccountReport }
  | { status: "error"; message: string };

export function Verify() {
  const history = useSharedHistory();
  const [input, setInput] = useState("");
  const [run, setRun] = useState<Run>({ status: "idle" });
  const ready = history.history != null && history.verifiedTo != null;
  const ranked = useMemo(() => (ready ? activeAccounts(history.rows) : []), [ready, history.rows]);
  const p = history.progress;
  const toBlock =
    history.head ??
    (p?.unit === "blocks" ? history.fromBlock + p.total - 1 : history.fromBlock + 1);
  const act = useMemo(
    () => activity(history.rows, history.fromBlock, Math.max(toBlock, history.fromBlock + 1)),
    [history.rows, history.fromBlock, toBlock],
  );
  const nativeRows = useMemo(
    () => history.rows.filter((r) => r.cells.asset === "native").length,
    [history.rows],
  );

  const start = (value: string) => {
    const v = value.trim();
    if (!v || !ready) return;
    setInput(v);
    setRun({ status: "running", input: v });
    verifyAccount(history, v).then(
      (report) => setRun({ status: "done", report }),
      (e: unknown) =>
        setRun({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    start(input);
  };

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>Verify an account</h1>
          <p>
            Every row of the account is re-derived from its block, and its balance is reconciled
            with chain state.
          </p>
        </div>
      </div>

      <form className="verify-bar" onSubmit={submit}>
        <Icon name="search" />
        <input
          className="mono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="SS58 address, 0x AccountId32 or 0x H160"
          aria-label="Account to verify"
          spellCheck={false}
        />
        <button type="submit" className="btn primary" disabled={!ready || run.status === "running"}>
          <Icon name="shield" />
          {ready ? (run.status === "running" ? "Verifying…" : "Verify") : "Loading history…"}
        </button>
      </form>

      {run.status === "done" ? (
        <AccountView report={run.report} />
      ) : (
        <div className="content">
          <section className="panel">
            <div className="ph">
              <h2>Most active accounts</h2>
              <span>
                {ready
                  ? `top ${ranked.length} of the loaded history · click to verify`
                  : "available when the history has loaded"}
              </span>
            </div>
            {!ready && <LoadingState history={history} />}
            <div className="scroll" hidden={!ready}>
              <table className="rows">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="r">Rows</th>
                    <th className="r">Native rows</th>
                    <th className="r">Last block</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((a) => (
                    <tr
                      key={a.account}
                      className="clickable"
                      onClick={() => start(a.account)}
                      style={{ height: 52 }}
                    >
                      <td>
                        <div className="who">
                          <Identicon account={a.account} />
                          <div>
                            <b className="mono">{shortHex(a.account)}</b>
                            <small>{a.account.length === 42 ? "H160 (EVM)" : "AccountId32"}</small>
                          </div>
                        </div>
                      </td>
                      <td className="mono r">{fmt(a.rows)}</td>
                      <td className="mono r">{fmt(a.native)}</td>
                      <td className="mono r">{fmt(a.lastBlock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {run.status === "running" && (
              <div className="proof">
                <span className="t">
                  <Icon name="shield" />
                  Verifying
                </span>
                <p className="mono">{run.input}</p>
              </div>
            )}
            {run.status === "error" && (
              <div className="proof bad">
                <span className="t">
                  <Icon name="cross" />
                  Error
                </span>
                <p>{run.message}</p>
              </div>
            )}
          </section>
          <aside className="side">
            <section className="panel">
              <div className="ph">
                <h2>What gets checked</h2>
                <span>against {PORTALDOT.name}</span>
              </div>
              <ol className="explain">
                <li>
                  <b>Address forms</b>
                  <span>
                    The SS58 / AccountId32 and its EVM H160 are resolved by the runtime (ReviveApi),
                    never computed locally, so native and token rows of the same owner are found
                    together.
                  </span>
                </li>
                <li>
                  <b>L2 · Row truth</b>
                  <span>
                    Each block the account appears in is fetched again and decoded with the runtime
                    that executed it. Every row must exist there byte for byte: invented or altered
                    rows fail.
                  </span>
                </li>
                <li>
                  <b>L3 · Reconciliation</b>
                  <span>
                    The balance before the range plus every row's effect must equal the balance the
                    chain reports at the end. A hidden row makes it fail, even if the publisher
                    forged every hash.
                  </span>
                </li>
              </ol>
            </section>
            <ActivityPanel
              buckets={act.buckets}
              size={act.size}
              fromBlock={history.fromBlock}
              toBlock={toBlock}
              native={nativeRows}
              token={history.rows.length - nativeRows}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

function AccountView({ report }: { report: AccountReport }) {
  const { ids, rows, rowTruth, balance } = report;
  const perspective = useMemo(() => new Set([ids.id32, ids.h160]), [ids]);
  const native = rows.filter((r) => r.cells.asset === "native").length;
  const l2ok = rowTruth.failed.length === 0;
  const l3ok = balance?.ok ?? null;
  const verified = l2ok && l3ok !== false;

  return (
    <>
      <div className="tiles">
        <div className="tile">
          <span className="lbl">Balance on chain</span>
          <span className="big mono">
            {balance ? formatNative(balance.after) : "—"}
            <small> tPOT</small>
          </span>
          <span className="sub">free + reserved at #{fmt(report.range.toBlock)}</span>
        </div>
        <div className="tile">
          <span className="lbl">Rows for this account</span>
          <span className="big mono">{fmt(rows.length)}</span>
          <span className="sub">
            {fmt(native)} native · {fmt(rows.length - native)} token
          </span>
        </div>
        <div className="tile yellow">
          <span className="lbl">Net change in range</span>
          <span className="big mono">
            {balance
              ? `${balance.actualDelta > 0n ? "+" : ""}${formatNative(balance.actualDelta)}`
              : "—"}
            <small> tPOT</small>
          </span>
          <span className="sub">
            #{fmt(report.range.fromBlock)} → #{fmt(report.range.toBlock)}
          </span>
        </div>
        <div className={`tile ${verified ? "blue" : "red"}`}>
          <span className="lbl">Verdict</span>
          <span className="big">{verified ? "Verified" : "Mismatch"}</span>
          <span className="sub">
            {verified ? "history matches the chain" : "do not trust this history"}
          </span>
        </div>
      </div>

      <div className="content">
        <section className="panel">
          <div className="ph">
            <h2>Account history</h2>
            <span>newest first · signs relative to this account</span>
          </div>
          <RowsTable rows={rows} filter={null} perspective={perspective} />
          <div className={`proof${verified ? "" : " bad"}`}>
            <span className="t">
              <Icon name="shield" />
              Proof
            </span>
            <p>
              {verified
                ? `All ${fmt(rowTruth.checked)} rows exist on chain and the balance reconciles exactly. Checked in ${formatDuration(rowTruth.ms + report.balanceMs)} against ${PORTALDOT.ws.replace("wss://", "")}.`
                : `${fmt(rowTruth.failed.length)} rows are not on chain${l3ok === false ? " and the balance does not reconcile" : ""}.`}
            </p>
          </div>
        </section>
        <aside className="side">
          <section className="panel">
            <div className="ph">
              <h2>Proof report</h2>
              <span>{formatDuration(rowTruth.ms + report.balanceMs)}</span>
            </div>
            <ul className="checks">
              <li>
                <span className={`ck ck-${l2ok ? "ok" : "fail"}`}>
                  <Icon name={l2ok ? "check" : "cross"} size={15} stroke={2.2} />
                </span>
                <div>
                  <b>L2 · Row truth</b>
                  <small>{fmt(rowTruth.blocks)} blocks re-derived</small>
                </div>
                <span className="v mono">
                  {fmt(rowTruth.checked - rowTruth.failed.length)} / {fmt(rowTruth.checked)}
                </span>
              </li>
              <li>
                <span className={`ck ck-${l3ok === null ? "n/a" : l3ok ? "ok" : "fail"}`}>
                  {l3ok === null ? (
                    <span className="na">–</span>
                  ) : (
                    <Icon name={l3ok ? "check" : "cross"} size={15} stroke={2.2} />
                  )}
                </span>
                <div>
                  <b>L3 · Reconciliation</b>
                  <small>
                    {balance ? "native balance over the range" : "no reconcilable native rows"}
                  </small>
                </div>
                <span className="v mono">{l3ok === null ? "n/a" : l3ok ? "exact" : "off"}</span>
              </li>
            </ul>
            {balance && (
              <dl className="ledger mono">
                <dt>Balance at #{fmt(report.range.fromBlock - 1)}</dt>
                <dd>{formatNative(balance.before)}</dd>
                <dt>+ effect of {fmt(native)} rows</dt>
                <dd>
                  {balance.expectedDelta >= 0n ? "+" : ""}
                  {formatNative(balance.expectedDelta)}
                </dd>
                <dt>= expected at #{fmt(report.range.toBlock)}</dt>
                <dd>{formatNative(balance.before + balance.expectedDelta)}</dd>
                <dt>chain reports</dt>
                <dd className={balance.ok ? "pos" : "neg"}>{formatNative(balance.after)}</dd>
              </dl>
            )}
          </section>
          <section className="panel grow">
            <div className="ph">
              <h2>Identity</h2>
              <span>resolved by the runtime</span>
            </div>
            <dl className="ids">
              <dt>SS58</dt>
              <dd className="mono">{ids.ss58}</dd>
              <dt>AccountId32</dt>
              <dd className="mono">{ids.id32}</dd>
              <dt>EVM H160</dt>
              <dd className="mono">{ids.h160}</dd>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

/** Shown in place of the accounts table until the shared history has loaded and reconciled. */
function LoadingState({ history }: { history: HistoryState }) {
  const p = history.progress;
  const pct = history.history ? 100 : p ? (p.done / Math.max(p.total, 1)) * 100 : 0;
  return (
    <div className="loading-state">
      <b>{history.history ? "History loaded" : "Loading the history from Portaldot"}</b>
      <span>
        {history.history
          ? `${fmt(history.rows.length)} rows ready`
          : p
            ? `${fmt(p.done)} of ${fmt(p.total)} ${p.unit} · ${fmt(history.rows.length)} rows so far`
            : "connecting and reading runtime versions…"}
      </span>
      <div className="track">
        <i style={{ width: `${pct}%` }} />
      </div>
      <small>Accounts can be verified once every row has been loaded.</small>
    </div>
  );
}
