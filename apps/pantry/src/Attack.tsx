import { useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { Identicon } from "./components/Identicon";
import { KindTag, RowsTable } from "./components/RowsTable";
import { activeAccounts } from "./lib/account";
import { type AttackResult, type AttackStep, hideableDebit, runAttack } from "./lib/attack";
import { fmt, formatAmount, formatDuration, formatNative, shortHex } from "./lib/format";
import { useSharedHistory } from "./lib/HistoryContext";
import { seriesOf } from "./lib/kinds";

const STEPS: { id: AttackStep; title: string; who: "attacker" | "client" }[] = [
  { id: "forge", title: "Hide one payment and rebuild the chunk", who: "attacker" },
  { id: "l1", title: "L1 · Integrity of the forged chunk", who: "client" },
  { id: "l2", title: "L2 · Row truth for the victim", who: "client" },
  { id: "l3", title: "L3 · Reconcile every account", who: "client" },
  { id: "flag", title: "Flag the manifest with evidence", who: "client" },
];

type Run =
  | { status: "idle" }
  | { status: "running"; step: AttackStep }
  | { status: "done"; result: AttackResult }
  | { status: "error"; message: string };

export function Attack() {
  const history = useSharedHistory();
  const ready = history.history != null && history.verifiedTo != null;
  const victims = useMemo(
    () =>
      ready
        ? activeAccounts(history.rows, 400)
            .filter((a) => a.account.length === 66 && hideableDebit(history.rows, a.account))
            .slice(0, 30)
        : [],
    [ready, history.rows],
  );
  const [victim, setVictim] = useState<string | null>(null);
  const chosen = victim ?? victims[0]?.account ?? null;
  const [run, setRun] = useState<Run>({ status: "idle" });

  const start = () => {
    if (!chosen) return;
    setRun({ status: "running", step: "forge" });
    runAttack(history, chosen, (step) => setRun({ status: "running", step })).then(
      (result) => setRun({ status: "done", result }),
      (e: unknown) =>
        setRun({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  };

  const result = run.status === "done" ? run.result : null;
  const caught = result ? result.reconciliation.failed.length > 0 : null;
  const stepIndex =
    run.status === "running"
      ? STEPS.findIndex((s) => s.id === run.step)
      : run.status === "done"
        ? STEPS.length
        : -1;
  const hidden = result?.hidden ?? (chosen ? hideableDebit(history.rows, chosen) : undefined);
  const victimRows = useMemo(
    () =>
      chosen ? history.rows.filter((r) => r.cells.from === chosen || r.cells.to === chosen) : [],
    [chosen, history.rows],
  );
  const perspective = useMemo(() => new Set(chosen ? [chosen] : []), [chosen]);

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>Attack demo</h1>
          <p>
            A dishonest publisher hides one payment and recomputes every hash. Watch which check
            catches it.
          </p>
        </div>
      </div>

      <div className="verify-bar">
        <span className="bar-label">Victim</span>
        <select
          className="mono"
          value={chosen ?? ""}
          onChange={(e) => {
            setVictim(e.target.value);
            setRun({ status: "idle" });
          }}
          disabled={!ready || run.status === "running"}
          aria-label="Account whose payment is hidden"
        >
          {!ready && <option value="">loading history…</option>}
          {victims.map((v) => (
            <option key={v.account} value={v.account}>
              {v.account} · {v.rows} rows
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn danger"
          onClick={start}
          disabled={!ready || !chosen || run.status === "running"}
        >
          <Icon name="cross" />
          {run.status === "running" ? "Attacking…" : "Run the attack"}
        </button>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="lbl">Payment hidden</span>
          <span className="big mono">
            {hidden ? `−${formatAmount(hidden)}` : "—"}
            <small> tPOT</small>
          </span>
          <span className="sub">
            {hidden ? `${hidden.cells.kind} at block #${fmt(hidden.block)}` : "choose a victim"}
          </span>
        </div>
        <div className="tile">
          <span className="lbl">Forged chunk passes L1</span>
          <span className="big">
            {result ? (result.integrityProblems.length === 0 ? "Yes" : "No") : "—"}
          </span>
          <span className="sub">
            {result
              ? `digest ${shortHex(result.forged.digest)} ≠ honest ${shortHex(result.honest.digest)}`
              : "hashes recomputed by the attacker"}
          </span>
        </div>
        <div className="tile yellow">
          <span className="lbl">Accounts reconciled</span>
          <span className="big mono">
            {result ? fmt(result.reconciliation.checks - result.reconciliation.failed.length) : "—"}
            <small> / {result ? fmt(result.reconciliation.checks) : "—"}</small>
          </span>
          <span className="sub">
            {result
              ? `${fmt(result.reconciliation.failed.length)} mismatch found by L3`
              : "L3 against Portaldot state"}
          </span>
        </div>
        <div className={`tile ${caught === false ? "red" : "blue"}`}>
          <span className="lbl">Verdict</span>
          <span className="big">{caught === null ? "—" : caught ? "Caught" : "Missed"}</span>
          <span className="sub">
            {result
              ? `in ${formatDuration(result.ms.l1 + result.ms.l2 + result.ms.l3)} of checks`
              : "run the attack"}
          </span>
        </div>
      </div>

      <div className="content">
        <section className="panel">
          <div className="ph">
            <h2>What happens</h2>
            <span>
              everything below runs in this browser against {history.client ? "Portaldot V3" : "…"}
            </span>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => {
              const state =
                i < stepIndex
                  ? "done"
                  : i === stepIndex && run.status === "running"
                    ? "active"
                    : "todo";
              return (
                <li key={s.id} className={`step ${state}`}>
                  <span className={`who ${s.who}`}>{s.who}</span>
                  <div>
                    <b>{s.title}</b>
                    <p>{stepText(s.id, result, hidden)}</p>
                  </div>
                  <span className="v mono">
                    {result ? formatDuration(result.ms[s.id]) : state === "active" ? "running" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="subhead">
            <b>Victim's real history</b>
            <span>
              {hidden
                ? "highlighted: the payment the attacker removes"
                : `${fmt(victimRows.length)} rows`}
            </span>
          </div>
          <RowsTable rows={victimRows} filter={null} perspective={perspective} highlight={hidden} />
          {run.status === "error" && (
            <div className="proof bad">
              <span className="t">
                <Icon name="cross" />
                Error
              </span>
              <p>{run.message}</p>
            </div>
          )}
          {result && (
            <div className={`proof${caught ? "" : " bad"}`}>
              <span className="t">
                <Icon name="shield" />
                Proof
              </span>
              <p>
                {caught
                  ? `L1 and L2 passed because the forgery is self-consistent and every remaining row is real. L3 caught it: the victim's balance on chain is ${formatNative(result.victimCheck?.after ?? 0n)} tPOT, the forged history implies ${formatNative((result.victimCheck?.before ?? 0n) + (result.victimCheck?.expectedDelta ?? 0n))}.`
                  : "The forgery was not detected."}
              </p>
            </div>
          )}
        </section>
        <aside className="side">
          <section className="panel">
            <div className="ph">
              <h2>Victim</h2>
              <span>{chosen ? "AccountId32" : ""}</span>
            </div>
            {chosen && (
              <div className="victim">
                <Identicon account={chosen} />
                <div>
                  <b className="mono">{shortHex(chosen)}</b>
                  {hidden && (
                    <small>
                      hides{" "}
                      <KindTag
                        kind={hidden.cells.kind ?? "?"}
                        series={seriesOf(hidden.cells.kind ?? "")}
                      />{" "}
                      to {hidden.cells.to ? shortHex(hidden.cells.to) : "fees"}
                    </small>
                  )}
                </div>
              </div>
            )}
            {result?.victimCheck && (
              <dl className="ledger mono">
                <dt>Balance at #{fmt(result.range.fromBlock - 1)}</dt>
                <dd>{formatNative(result.victimCheck.before)}</dd>
                <dt>+ forged rows</dt>
                <dd>{formatNative(result.victimCheck.expectedDelta)}</dd>
                <dt>= forged history</dt>
                <dd className="neg">
                  {formatNative(result.victimCheck.before + result.victimCheck.expectedDelta)}
                </dd>
                <dt>chain reports</dt>
                <dd className="pos">{formatNative(result.victimCheck.after)}</dd>
                <dt>difference</dt>
                <dd>
                  {formatNative(result.victimCheck.actualDelta - result.victimCheck.expectedDelta)}
                </dd>
              </dl>
            )}
          </section>
          <section className="panel grow">
            <div className="ph">
              <h2>Flag on Portaldot</h2>
              <span>PotluckRegistry.flag</span>
            </div>
            <dl className="ids">
              <dt>reason</dt>
              <dd className="mono">
                {result ? `${result.flag.reason} · ${result.flag.reasonName}` : "—"}
              </dd>
              <dt>evidence (blake2b-256 of the mismatch report)</dt>
              <dd className="mono">{result ? result.flag.evidence : "—"}</dd>
              <dt>manifest id</dt>
              <dd>
                assigned when a manifest is published; the registry is not deployed yet (needs
                tPOT), so the flag cannot be sent from this page today.
              </dd>
              <dt>after flagging</dt>
              <dd>
                clients rank flagged manifests last and load from an honest publisher or by direct
                sync, as Overview does now.
              </dd>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function stepText(
  step: AttackStep,
  r: AttackResult | null,
  hidden: AttackResult["hidden"] | undefined,
): string {
  switch (step) {
    case "forge":
      return r
        ? `Removed ${r.hidden.cells.kind} of ${formatAmount(r.hidden)} tPOT at #${fmt(r.hidden.block)}; ${fmt(r.honest.rows)} → ${fmt(r.forged.rows)} rows. Raw hash, bloom and blob digest recomputed.`
        : hidden
          ? `Will remove the ${hidden.cells.kind} of ${formatAmount(hidden)} tPOT at #${fmt(hidden.block)} and recompute every hash.`
          : "Pick a victim with a payment to hide.";
    case "l1":
      return r
        ? r.integrityProblems.length === 0
          ? "Passes: digest, raw hash, canonical encoding, row count, range and bloom are all consistent. Integrity alone cannot see a forgery."
          : `Fails: ${r.integrityProblems.join("; ")}`
        : "Checks the chunk against its own manifest entry.";
    case "l2":
      return r
        ? `${fmt(r.rowTruth.checked - r.rowTruth.failed)} / ${fmt(r.rowTruth.checked)} remaining rows of the victim exist on chain. A deleted row leaves nothing to re-derive.`
        : "Re-derives each block the victim appears in.";
    case "l3":
      return r
        ? `${fmt(r.reconciliation.failed.length)} of ${fmt(r.reconciliation.checks)} accounts do not reconcile: ${r.reconciliation.failed.map((f) => shortHex(f.account)).join(", ")}.`
        : "Balance before + every row's effect must equal the chain's balance after.";
    case "flag":
      return r
        ? "Evidence digest computed from the mismatch report (right)."
        : "Records the mismatch on Portaldot so other clients skip the manifest.";
  }
}
