import { fmt, formatDuration, formatNative } from "@potluck/ui/format";
import { Icon } from "@potluck/ui/Icon";
import { Identicon } from "@potluck/ui/Identicon";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { RowsTable } from "./components/RowsTable";
import { POLKADOT_AH } from "./config";
import { activeAccounts } from "./lib/account";
import {
  type AhAccountReport,
  ahSs58,
  checkAhAccount,
  measureDirectSync,
  parseAhAccount,
  ROW_TRUTH_LIMIT,
  shortAhSs58,
} from "./lib/heavy";
import { useSnapshot } from "./lib/SnapshotContext";

type Check =
  | { status: "idle" }
  | { status: "running"; account: string }
  | { status: "done"; report: AhAccountReport }
  | { status: "error"; message: string };

type Sample =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; blocks: number; ms: number; perSecond: number }
  | { status: "error"; message: string };

const UNIT = { symbol: POLKADOT_AH.symbol, decimals: POLKADOT_AH.decimals };
const dot = (v: bigint) => `${formatNative(v, POLKADOT_AH.decimals)} ${POLKADOT_AH.symbol}`;

export function Heavy() {
  const { state, start } = useSnapshot();
  useEffect(() => start(), [start]);
  const [input, setInput] = useState("");
  const [check, setCheck] = useState<Check>({ status: "idle" });
  const [sample, setSample] = useState<Sample>({ status: "idle" });
  const ready = state.phase === "ready" && state.history && state.source;
  const ranked = useMemo(() => (ready ? activeAccounts(state.rows, 60) : []), [ready, state.rows]);
  const accounts = useMemo(() => {
    const set = new Set<string>();
    for (const r of state.rows) {
      if (r.cells.from) set.add(r.cells.from);
      if (r.cells.to) set.add(r.cells.to);
    }
    return set.size;
  }, [state.rows]);
  const range = state.entry?.manifest.range;
  const windowBlocks = range ? range.toBlock - range.fromBlock + 1 : 0;
  const perspective = useMemo(
    () => (check.status === "done" ? new Set([check.report.account]) : undefined),
    [check],
  );
  const shown =
    check.status === "done" ? check.report.rows : check.status === "running" ? [] : state.rows;

  const verify = (account: string) => {
    if (!state.history || !state.source) return;
    setInput(ahSs58(account));
    setCheck({ status: "running", account });
    checkAhAccount(state.history, state.source, account).then(
      (report) => setCheck({ status: "done", report }),
      (e: unknown) =>
        setCheck({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const account = parseAhAccount(input);
    if (!account) {
      setCheck({ status: "error", message: "Not an address: use SS58 or a 32-byte AccountId." });
      return;
    }
    verify(account);
  };
  const measure = () => {
    if (!state.source || !range) return;
    setSample({ status: "running" });
    measureDirectSync(state.source, range.toBlock).then(
      (r) => setSample({ status: "done", ...r }),
      (e: unknown) =>
        setSample({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  };

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>Polkadot Asset Hub, from a snapshot</h1>
          <p>
            The newest published window of Asset Hub balance history, fetched from Portaldot over
            bitswap and checked against Polkadot Asset Hub itself. No indexer server is involved.
          </p>
        </div>
      </div>

      <form className="verify-bar" onSubmit={submit}>
        <Icon name="search" />
        <input
          className="mono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Polkadot address (SS58) or 0x AccountId32"
          aria-label="Polkadot Asset Hub account"
        />
        <button type="submit" className="btn primary" disabled={!ready}>
          <Icon name="shield" />
          {ready ? "Verify" : "Loading…"}
        </button>
      </form>

      <div className="tiles">
        <div className="tile">
          <span className="lbl">Rows in the window</span>
          <span className="big mono">{state.rows.length ? fmt(state.rows.length) : "—"}</span>
          <span className="sub">
            {range
              ? `#${fmt(range.fromBlock)} – #${fmt(range.toBlock)} · ${fmt(windowBlocks)} blocks`
              : "reading the registry…"}
          </span>
        </div>
        <div className="tile">
          <span className="lbl">Accounts</span>
          <span className="big mono">{accounts ? fmt(accounts) : "—"}</span>
          <span className="sub">touched in this window</span>
        </div>
        <div className="tile yellow">
          <span className="lbl">Loaded from Portaldot</span>
          <span className="big mono">
            {state.ms != null ? formatDuration(state.ms) : state.phase === "error" ? "—" : "…"}
          </span>
          <span className="sub">
            {state.chunks
              ? `${(state.bytes / 1024 / 1024).toFixed(1)} MB in ${state.chunks.done} of ${state.chunks.total} chunks${state.fromCache > 0 ? ` (${state.fromCache} blobs from this browser's cache)` : ""} · L1 ${state.history ? (state.history.integrityOk ? "ok" : "failed") : "…"}`
              : "registry + bitswap, no server"}
          </span>
        </div>
        <div className="tile blue">
          <span className="lbl">Direct sync in this browser</span>
          {sample.status === "done" ? (
            <>
              <span className="big mono">
                ≈ {formatDuration(Math.round((windowBlocks / sample.perSecond) * 1000))}
              </span>
              <span className="sub">
                {fmt(Math.round(sample.perSecond))} blocks/s on a {fmt(sample.blocks)}-block sample,
                events only
              </span>
            </>
          ) : (
            <>
              <span className="big">
                {sample.status === "running" ? "Measuring…" : sample.status === "error" ? "—" : "?"}
              </span>
              <span className="sub">
                {sample.status === "error" ? (
                  sample.message
                ) : (
                  <button
                    type="button"
                    className="link on-dark"
                    onClick={measure}
                    disabled={!ready || sample.status === "running"}
                  >
                    Measure it: fetch {fmt(300)} blocks from Asset Hub
                  </button>
                )}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="content">
        <section className="panel">
          <div className="ph">
            <h2>
              {check.status === "done"
                ? `Rows of ${shortAhSs58(check.report.account)}`
                : "Balance history"}
            </h2>
            <span>
              {check.status === "done" ? (
                <button type="button" className="link" onClick={() => setCheck({ status: "idle" })}>
                  Show every row
                </button>
              ) : (
                "newest first"
              )}
            </span>
          </div>
          {state.phase === "error" ? (
            <div className="loading-state">
              <b>Could not load the snapshot</b>
              <span>{state.error}</span>
            </div>
          ) : !ready ? (
            <div className="loading-state">
              <b>Loading the snapshot from Portaldot</b>
              <span>
                {state.phase === "connecting"
                  ? `connecting to ${POLKADOT_AH.ws.replace("wss://", "")}…`
                  : state.chunks
                    ? `chunk ${state.chunks.done} of ${state.chunks.total} fetched and checked`
                    : "reading the registry and the manifest…"}
              </span>
            </div>
          ) : (
            <RowsTable
              rows={shown}
              filter={null}
              perspective={perspective}
              unit={UNIT}
              label={shortAhSs58}
            />
          )}
          {ready && (
            <div className="proof">
              <span className="t">
                <Icon name="shield" />
                Proof
              </span>
              <p>
                Every chunk matched its manifest (digest, raw hash, canonical encoding, bloom).
                Verify any account for L2 and L3 against {POLKADOT_AH.name}.
              </p>
            </div>
          )}
        </section>

        <aside className="side">
          <section className="panel">
            <div className="ph">
              <h2>Account check</h2>
              <span>against {POLKADOT_AH.name}</span>
            </div>
            {check.status === "idle" && (
              <p className="side-note">
                Pick an account below or paste one above. Its rows are re-derived from their blocks
                (L2, up to {ROW_TRUTH_LIMIT} rows) and its balance must change by exactly the sum of
                its rows (L3).
              </p>
            )}
            {check.status === "running" && (
              <p className="side-note">
                Checking {shortAhSs58(check.account)} against {POLKADOT_AH.name}…
              </p>
            )}
            {check.status === "error" && <p className="side-note neg">{check.message}</p>}
            {check.status === "done" && <Report report={check.report} />}
          </section>
          <section className="panel grow">
            <div className="ph">
              <h2>Most active accounts</h2>
              <span>click to verify</span>
            </div>
            <div className="scroll">
              <table className="rows">
                <tbody>
                  {ranked.map((a) => (
                    <tr key={a.account} className="clickable" onClick={() => verify(a.account)}>
                      <td>
                        <div className="who">
                          <Identicon account={a.account} />
                          <b className="mono">{shortAhSs58(a.account)}</b>
                        </div>
                      </td>
                      <td className="mono r">{fmt(a.rows)} rows</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Report({ report }: { report: AhAccountReport }) {
  const b = report.balance;
  return (
    <>
      <ul className="checks">
        <li>
          <span
            className={`ck ${report.rowTruth ? (report.rowTruth.failed.length ? "ck-fail" : "ck-ok") : "ck-n/a"}`}
          >
            {report.rowTruth ? (
              <Icon
                name={report.rowTruth.failed.length ? "cross" : "check"}
                size={15}
                stroke={2.2}
              />
            ) : (
              <span className="na">–</span>
            )}
          </span>
          <div>
            <b>L2 · Row truth</b>
            <small>
              {report.rowTruth
                ? `${fmt(report.rowTruth.blocks)} blocks re-read in ${formatDuration(report.rowTruth.ms)}`
                : `skipped above ${ROW_TRUTH_LIMIT} rows; L3 still catches a hidden row`}
            </small>
          </div>
          <span className="v mono">
            {report.rowTruth
              ? `${fmt(report.rowTruth.checked - report.rowTruth.failed.length)} / ${fmt(report.rowTruth.checked)}`
              : `${fmt(report.rows.length)} rows`}
          </span>
        </li>
        <li>
          <span className={`ck ${b ? (b.ok ? "ck-ok" : "ck-fail") : "ck-n/a"}`}>
            {b ? (
              <Icon name={b.ok ? "check" : "cross"} size={15} stroke={2.2} />
            ) : (
              <span className="na">–</span>
            )}
          </span>
          <div>
            <b>L3 · Reconciliation</b>
            <small>
              {b
                ? `both window edges read in ${formatDuration(report.balanceMs)}`
                : "not checkable"}
            </small>
          </div>
          <span className="v mono">{b ? (b.ok ? "exact" : "differs") : "—"}</span>
        </li>
      </ul>
      {b && (
        <dl className="ledger mono">
          <dt>balance before</dt>
          <dd>{dot(b.before)}</dd>
          <dt>+ rows in window</dt>
          <dd>{dot(b.expectedDelta)}</dd>
          <dt>= expected after</dt>
          <dd>{dot(b.before + b.expectedDelta)}</dd>
          <dt>chain reports</dt>
          <dd className={b.ok ? "pos" : "neg"}>{dot(b.after)}</dd>
        </dl>
      )}
    </>
  );
}
