import { fmt } from "@potluck/ui/format";
import { Icon } from "@potluck/ui/Icon";
import { Identicon } from "@potluck/ui/Identicon";
import { KUSAMA_AH } from "./config";
import { type AccountState, useRecovery } from "./lib/RecoveryContext";
import { blocksToDuration, describe, formatDate, formatToken, shortSs58, ss58 } from "./lib/text";
import { statusOf } from "./Plans";

export function Timeline({ account, onBack }: { account: string; onBack: () => void }) {
  const r = useRecovery();
  const a = r.accounts.find((x) => x.account === account);
  const rep = r.replays.get(account);
  if (!a) return null;
  const status = statusOf(a);
  const open = a.attempts.map((x) => x.groupIndex + 1).join(", ");

  return (
    <div className="page">
      <div className="head">
        <div>
          <button type="button" className="link back" onClick={onBack}>
            ← All plans
          </button>
          <h1 className="serif">The inheritance of {shortSs58(account)}</h1>
          <p className="mono">{ss58(account)}</p>
        </div>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="lbl">Status</span>
          <span className="big">{status.label}</span>
          <span className="sub">
            {a.inheritor
              ? `inherited by ${shortSs58(a.inheritor.inheritor)}`
              : a.attempts.length
                ? `attempt open in group ${open}`
                : "no recovery in progress"}
          </span>
        </div>
        <div className="tile">
          <span className="lbl">Friend groups</span>
          <span className="big mono">{a.plan ? a.plan.groups.length : 0}</span>
          <span className="sub">
            {a.plan
              ? `deposit ${formatToken(a.plan.deposit, KUSAMA_AH.decimals)} ${KUSAMA_AH.symbol}`
              : "no plan stored now"}
          </span>
        </div>
        <div className="tile yellow">
          <span className="lbl">Timeline entries</span>
          <span className="big mono">{rep ? rep.timeline.length : "…"}</span>
          <span className="sub">
            {rep
              ? `${rep.timeline.filter((e) => e.source === "event").length} from block events, ${rep.timeline.filter((e) => e.source === "potluck").length} from the Potluck snapshot`
              : "rebuilding from chain…"}
          </span>
        </div>
        <div className={`tile ${rep && !rep.matches ? "red" : "blue"}`}>
          <span className="lbl">State replay</span>
          <span className="big">{rep ? (rep.matches ? "Matches" : "Differs") : "…"}</span>
          <span className="sub">
            {rep ? "replayed timeline vs storage at the head" : "waiting for the timeline"}
          </span>
        </div>
      </div>

      <div className="content">
        <section className="panel">
          <div className="ph">
            <h2>Timeline</h2>
            <span>oldest first · block numbers open Subscan</span>
          </div>
          <div className="scroll">
            {!rep ? (
              <div className="loading-state">
                <b>Rebuilding the timeline</b>
                <span>searching storage changes and reading their blocks…</span>
              </div>
            ) : (
              <ol className="timeline">
                {rep.timeline.map((e) => {
                  const d = describe(e);
                  return (
                    <li key={`${e.block}:${e.eventIndex}:${e.kind}`} className={e.source}>
                      <div className="when">
                        <b>{formatDate(e.time)}</b>
                        <a
                          className="mono"
                          href={KUSAMA_AH.explorerBlock(e.block)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          #{fmt(e.block)}
                        </a>
                      </div>
                      <div className="mark" />
                      <div className="what">
                        <h3 className="serif">{d.title}</h3>
                        <p>{d.detail}</p>
                        <span className={`origin ${e.source}`}>
                          {e.source === "event"
                            ? `Recovery.${e.kind} · event ${e.eventIndex}${e.inSnapshot ? " · also in the Potluck snapshot" : ""}`
                            : e.source === "potluck"
                              ? `Recovery.${e.kind} · event ${e.eventIndex} · from the Potluck snapshot on Portaldot (missed by the storage search)`
                              : "state at the inheritance-API upgrade"}
                        </span>
                      </div>
                    </li>
                  );
                })}
                <li className="now">
                  <div className="when">
                    <b>Now</b>
                    <span className="mono">#{r.head ? fmt(r.head) : "…"}</span>
                  </div>
                  <div className="mark" />
                  <div className="what">
                    <h3 className="serif">{status.label}</h3>
                    <p>
                      {a.inheritor
                        ? `${shortSs58(a.inheritor.inheritor)} is the inheritor.`
                        : a.attempts.length
                          ? `${a.attempts.length} attempt(s) open, ${a.attempts.reduce((n, x) => n + x.approvals, 0)} approval(s) so far.`
                          : "The plan stands; nobody has started a recovery."}
                    </p>
                  </div>
                </li>
              </ol>
            )}
          </div>
          {rep && (
            <div className={`proof${rep.matches ? "" : " bad"}`}>
              <span className="t">
                <Icon name="shield" />
                Replay
              </span>
              <p>
                Replaying these entries gives{" "}
                {rep.replayed.inheritor
                  ? `inheritor ${shortSs58(rep.replayed.inheritor)}`
                  : "no inheritor"}
                ,{" "}
                {rep.replayed.openAttempts.length
                  ? `open attempts in group ${rep.replayed.openAttempts.map((i) => i + 1).join(", ")}`
                  : "no open attempt"}{" "}
                and {rep.replayed.configured ? "a plan in place" : "no plan"}:{" "}
                {rep.matches
                  ? "exactly what the chain stores today."
                  : "not what the chain stores. Do not trust this timeline."}
              </p>
            </div>
          )}
        </section>
        <aside className="side">
          <section className="panel">
            <div className="ph">
              <h2>Current plan</h2>
              <span>Recovery.FriendGroups</span>
            </div>
            <div className="groups">
              {a.plan ? (
                a.plan.groups.map((g, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a group's position is its on-chain friend_group_index.
                  <div key={i} className="group">
                    <div className="group-h">
                      <b>Group {i + 1}</b>
                      <span className="mono">
                        {g.friendsNeeded} of {g.friends.length} must vouch
                      </span>
                    </div>
                    <div className="friends">
                      {g.friends.map((f) => (
                        <span key={f} className="friend" title={ss58(f)}>
                          <Identicon account={f} />
                          <span className="mono">{shortSs58(f)}</span>
                        </span>
                      ))}
                    </div>
                    <dl className="ledger mono">
                      <dt>inheritor</dt>
                      <dd>{shortSs58(g.inheritor)}</dd>
                      <dt>inheritance delay</dt>
                      <dd>{blocksToDuration(g.inheritanceDelay)}</dd>
                      <dt>cancel delay</dt>
                      <dd>{blocksToDuration(g.cancelDelay)}</dd>
                      <dt>priority</dt>
                      <dd>{g.inheritancePriority}</dd>
                    </dl>
                  </div>
                ))
              ) : (
                <p className="empty-note">
                  No friend groups are stored for this account now
                  {a.inheritor ? "; it has already been inherited." : "."}
                </p>
              )}
            </div>
          </section>
          <section className="panel grow">
            <div className="ph">
              <h2>Recovery state</h2>
              <span>Recovery.Attempt · Recovery.Inheritor</span>
            </div>
            <RecoveryState account={a} />
          </section>
        </aside>
      </div>
    </div>
  );
}

/** What storage says about recovery right now: the inheritor, each open attempt, or what would happen next. */
function RecoveryState({ account: a }: { account: AccountState }) {
  if (a.inheritor) {
    return (
      <ol className="explain">
        <li>
          <b>Inherited through group {a.inheritor.groupIndex + 1}</b>
          <span>
            {shortSs58(a.inheritor.inheritor)} is stored as the inheritor and can act as this
            account.
          </span>
        </li>
      </ol>
    );
  }
  if (a.attempts.length > 0) {
    return a.attempts.map((t) => {
      const g = a.plan?.groups[t.groupIndex];
      return (
        <dl key={t.groupIndex} className="ledger mono">
          <dt>friend group</dt>
          <dd>{t.groupIndex + 1}</dd>
          <dt>approvals</dt>
          <dd>{g ? `${t.approvals} of ${g.friendsNeeded} needed` : t.approvals}</dd>
          <dt>started by</dt>
          <dd>{shortSs58(t.initiator)}</dd>
          <dt>started (relay block)</dt>
          <dd>#{fmt(t.initBlock)}</dd>
          <dt>attempt deposit</dt>
          <dd>
            {formatToken(t.deposit, KUSAMA_AH.decimals)} {KUSAMA_AH.symbol}
          </dd>
        </dl>
      );
    });
  }
  const g = a.plan?.groups[0];
  return (
    <ol className="explain">
      <li>
        <b>No recovery started</b>
        <span>Nobody has opened a recovery attempt for this account.</span>
      </li>
      {g && (
        <li>
          <b>If someone does</b>
          <span>
            {g.friendsNeeded} of {g.friends.length} friend(s) in group 1 must vouch, then{" "}
            <span className="mono">{shortSs58(g.inheritor)}</span> can take over{" "}
            {g.inheritanceDelay === 0
              ? "right away"
              : `after ${blocksToDuration(g.inheritanceDelay)}`}
            .
          </span>
        </li>
      )}
    </ol>
  );
}
