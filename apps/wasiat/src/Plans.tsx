import { fmt } from "@potluck/ui/format";
import { Icon } from "@potluck/ui/Icon";
import { Identicon } from "@potluck/ui/Identicon";
import { useMemo } from "react";
import { KUSAMA_AH } from "./config";
import { type AccountState, useRecovery } from "./lib/RecoveryContext";
import { RECOVERY_FROM_BLOCK } from "./lib/recovery";
import { blocksToDuration, formatToken, shortSs58 } from "./lib/text";

export function statusOf(a: AccountState): { label: string; series: number } {
  if (a.inheritor) return { label: "Inherited", series: 3 };
  if (a.attempts.length) return { label: "Recovery open", series: 4 };
  return { label: "Planned", series: 1 };
}

export function Plans({ onOpen }: { onOpen: (account: string) => void }) {
  const r = useRecovery();
  const counts = useMemo(
    () => ({
      plans: r.accounts.filter((a) => a.plan).length,
      open: r.accounts.reduce((n, a) => n + a.attempts.length, 0),
      inherited: r.accounts.filter((a) => a.inheritor).length,
    }),
    [r.accounts],
  );
  const replays = [...r.replays.values()];
  const matches = replays.filter((x) => x.matches).length;
  const events = replays.reduce(
    (n, x) => n + x.timeline.filter((e) => e.source === "event").length,
    0,
  );
  const carried = replays.reduce(
    (n, x) => n + x.timeline.filter((e) => e.source === "carried-over").length,
    0,
  );
  const fromSnapshot = replays.reduce(
    (n, x) => n + x.timeline.filter((e) => e.source === "potluck").length,
    0,
  );
  const confirmed = replays.reduce((n, x) => n + x.timeline.filter((e) => e.inSnapshot).length, 0);
  const snap = r.snapshot;
  const snapNote =
    snap.phase === "loading"
      ? "loading the Recovery history published on Portaldot…"
      : snap.phase === "error"
        ? `not loaded: ${snap.error}`
        : [
            `${fmt(snap.events.length)} rows to #${fmt(snap.snapshotTo ?? 0)} in ${((snap.ms ?? 0) / 1000).toFixed(1)} s, L1 ${snap.integrityOk ? "ok" : "failed"}`,
            `${fmt(fromSnapshot)} added to timelines, ${fmt(confirmed)} confirm block events`,
            snap.directBlocks ? `${fmt(snap.directBlocks)} newer blocks synced directly` : "",
            snap.uncovered.length
              ? `#${fmt(snap.uncovered[0]?.fromBlock ?? 0)} onward not published yet (storage search covers it)`
              : "",
          ]
            .filter(Boolean)
            .join(" · ");
  const loading = r.phase === "connecting" || r.phase === "loading";

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1 className="serif">Inheritance plans on {KUSAMA_AH.name}</h1>
          <p>
            Every account with a recovery plan, an open recovery attempt or an inheritor, read from
            chain state and checked against its own history.
          </p>
        </div>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="lbl">Accounts with a plan</span>
          <span className="big mono">{loading ? "—" : fmt(counts.plans)}</span>
          <span className="sub">Recovery.FriendGroups at #{r.head ? fmt(r.head) : "…"}</span>
        </div>
        <div className="tile">
          <span className="lbl">Recovery attempts open</span>
          <span className="big mono">{loading ? "—" : fmt(counts.open)}</span>
          <span className="sub">friends are vouching right now</span>
        </div>
        <div className="tile yellow">
          <span className="lbl">Accounts already inherited</span>
          <span className="big mono">{loading ? "—" : fmt(counts.inherited)}</span>
          <span className="sub">controlled by an inheritor</span>
        </div>
        <div className="tile blue">
          <span className="lbl">State replay</span>
          <span className="big mono">
            {r.phase === "ready"
              ? fmt(matches)
              : r.replayProgress
                ? fmt(r.replayProgress.done)
                : "—"}
            <small> / {r.accounts.length ? fmt(r.accounts.length) : "—"}</small>
          </span>
          <span className="sub">
            {r.phase === "ready" ? "timelines imply today's state" : "rebuilding every timeline…"}
          </span>
        </div>
      </div>

      <div className="content">
        <section className="panel">
          <div className="ph">
            <h2>Accounts</h2>
            <span>click an account for its timeline</span>
          </div>
          {loading ? (
            <div className="loading-state">
              <b>Reading the Recovery pallet</b>
              <span>
                {r.phase === "connecting"
                  ? `connecting to ${KUSAMA_AH.ws.replace("wss://", "")}…`
                  : "plans, attempts and inheritors at the finalized head…"}
              </span>
            </div>
          ) : (
            <div className="scroll">
              <table className="rows">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Status</th>
                    <th>Friends needed</th>
                    <th>Inheritor</th>
                    <th className="r">Delay</th>
                    <th>Replay</th>
                  </tr>
                </thead>
                <tbody>
                  {r.accounts.map((a) => {
                    const s = statusOf(a);
                    const g = a.plan?.groups[0];
                    const rep = r.replays.get(a.account);
                    return (
                      <tr
                        key={a.account}
                        className="clickable"
                        onClick={() => onOpen(a.account)}
                        style={{ height: 52 }}
                      >
                        <td>
                          <div className="who">
                            <Identicon account={a.account} />
                            <div>
                              <b className="mono">{shortSs58(a.account)}</b>
                              <small>
                                {a.plan
                                  ? `deposit ${formatToken(a.plan.deposit, KUSAMA_AH.decimals)} ${KUSAMA_AH.symbol}`
                                  : "no plan stored"}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className="tag"
                            style={{
                              background: `var(--series-${s.series})`,
                              color: `var(--on-series-${s.series})`,
                            }}
                          >
                            {s.label}
                          </span>
                        </td>
                        <td className="mono">
                          {g ? `${g.friendsNeeded} of ${g.friends.length}` : "—"}
                        </td>
                        <td className="mono">
                          {shortSs58(a.inheritor?.inheritor ?? g?.inheritor)}
                        </td>
                        <td className="mono r">{g ? blocksToDuration(g.inheritanceDelay) : "—"}</td>
                        <td>
                          {rep ? (
                            <span className={`state ${rep.matches ? "on" : "bad"}`}>
                              {rep.matches ? "Matches" : "Differs"}
                            </span>
                          ) : (
                            <span className="state off">…</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {r.phase === "error" && (
            <div className="proof bad">
              <span className="t">
                <Icon name="cross" />
                Error
              </span>
              <p>{r.error}</p>
            </div>
          )}
          {r.phase === "ready" && (
            <div className="proof">
              <span className="t">
                <Icon name="shield" />
                Replay
              </span>
              <p>
                {fmt(matches)} of {fmt(r.accounts.length)} timelines replay to exactly the state on
                chain. Checked in {((r.replayMs ?? 0) / 1000).toFixed(1)} s against{" "}
                {KUSAMA_AH.ws.replace("wss://", "")}.
              </p>
            </div>
          )}
        </section>
        <aside className="side">
          <section className="panel">
            <div className="ph">
              <h2>Timeline sources</h2>
              <span>since #{fmt(RECOVERY_FROM_BLOCK)}</span>
            </div>
            <ul className="checks">
              <li>
                <span className="ck ck-ok">
                  <Icon name="check" size={15} stroke={2.2} />
                </span>
                <div>
                  <b>Events from blocks</b>
                  <small>decoded with the runtime that executed them</small>
                </div>
                <span className="v mono">{fmt(events)}</span>
              </li>
              <li>
                <span className="ck ck-n/a">
                  <span className="na">–</span>
                </span>
                <div>
                  <b>Carried over</b>
                  <small>state migrated from the previous pallet</small>
                </div>
                <span className="v mono">{fmt(carried)}</span>
              </li>
              <li>
                <span
                  className={`ck ${snap.phase === "ready" ? (snap.integrityOk ? "ck-ok" : "ck-fail") : snap.phase === "error" ? "ck-fail" : "ck-pending"}`}
                >
                  {snap.phase === "loading" ? (
                    <span className="spin" />
                  ) : snap.phase === "ready" && snap.integrityOk ? (
                    <Icon name="check" size={15} stroke={2.2} />
                  ) : (
                    <Icon name="cross" size={15} stroke={2.2} />
                  )}
                </span>
                <div>
                  <b>Potluck snapshot on Portaldot</b>
                  <small>{snapNote}</small>
                </div>
                <span className="v mono">{fmt(fromSnapshot)}</span>
              </li>
            </ul>
          </section>
          <section className="panel grow">
            <div className="ph">
              <h2>How a plan works</h2>
              <span>Recovery pallet</span>
            </div>
            <ol className="explain">
              <li>
                <b>The owner names friends</b>
                <span>
                  Each friend group has friends, how many must vouch, an inheritor and a delay.
                  Several groups can exist, ranked by priority.
                </span>
              </li>
              <li>
                <b>Someone starts a recovery</b>
                <span>
                  Friends vouch on chain. When enough have approved and the delay has passed, the
                  attempt can be finished.
                </span>
              </li>
              <li>
                <b>The inheritor takes over</b>
                <span>
                  The inheritor can act as the account. A deposit (
                  {r.constants
                    ? `${formatToken(r.constants.securityDeposit, KUSAMA_AH.decimals)} ${KUSAMA_AH.symbol}`
                    : "…"}{" "}
                  here) makes frivolous attempts costly.
                </span>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
