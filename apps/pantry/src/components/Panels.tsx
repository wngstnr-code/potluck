import { fmt, formatDuration } from "../lib/format";
import type { ActivityBucket, KindStat } from "../lib/kinds";
import type { HistoryState } from "../lib/useHistory";
import { Icon } from "./Icon";

type Check = {
  title: string;
  detail: string;
  value: string;
  state: "ok" | "fail" | "pending" | "n/a";
};

function checksOf(h: HistoryState): Check[] {
  const loading = h.phase === "connecting" || h.phase === "loading";
  const snapshot = h.source && h.source.mode !== "direct";
  const l1: Check = loading
    ? {
        title: "L1 · Integrity",
        detail: "digest, raw hash, bloom per chunk",
        value: "…",
        state: "pending",
      }
    : snapshot
      ? {
          title: "L1 · Integrity",
          detail: "digest, raw hash, bloom per chunk",
          value: `${h.source?.chunks ?? 0} chunks`,
          state: h.integrityOk ? "ok" : "fail",
        }
      : {
          title: "L1 · Integrity",
          detail: "no snapshot used: nothing to check",
          value: "direct",
          state: "n/a",
        };
  const l2: Check = snapshot
    ? {
        title: "L2 · Row truth",
        detail: "per account, on the Verify page",
        value: "per account",
        state: "n/a",
      }
    : {
        title: "L2 · Row truth",
        detail: "every row decoded from source events",
        value: loading ? "…" : "by construction",
        state: loading ? "pending" : "ok",
      };
  const r = h.reconciliation;
  const p = h.reconcileProgress;
  const l3: Check = r
    ? {
        title: "L3 · Reconciliation",
        detail: "balances at window edges",
        value: `${fmt(r.checks - r.failed.length)} / ${fmt(r.checks)}`,
        state: r.ok ? "ok" : "fail",
      }
    : {
        title: "L3 · Reconciliation",
        detail: p ? `window ${p.done} of ${p.total}` : "balances at window edges",
        value: h.phase === "verifying" ? "checking" : "…",
        state: "pending",
      };
  return [l1, l2, l3];
}

export function VerificationPanel({ history }: { history: HistoryState }) {
  return (
    <section className="panel">
      <div className="ph">
        <h2>Verification</h2>
        <span>against the source chain</span>
      </div>
      <ul className="checks">
        {checksOf(history).map((c) => (
          <li key={c.title}>
            <span className={`ck ck-${c.state}`}>
              {c.state === "ok" && <Icon name="check" size={15} stroke={2.2} />}
              {c.state === "fail" && <Icon name="cross" size={14} stroke={2.2} />}
              {c.state === "pending" && <span className="spin" />}
              {c.state === "n/a" && <span className="na">–</span>}
            </span>
            <div>
              <b>{c.title}</b>
              <small>{c.detail}</small>
            </div>
            <span className="v mono">{c.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KindsPanel({
  kinds,
  total,
  filter,
  onFilter,
}: {
  kinds: readonly KindStat[];
  total: number;
  filter: string | null;
  onFilter: (kind: string | null) => void;
}) {
  const max = kinds[0]?.count ?? 1;
  return (
    <section className="panel">
      <div className="ph">
        <h2>Row kinds</h2>
        <span>
          {filter ? (
            <button type="button" className="link" onClick={() => onFilter(null)}>
              Show all
            </button>
          ) : (
            `${fmt(total)} rows`
          )}
        </span>
      </div>
      <div className="kinds">
        <div className="stack">
          {kinds.map((k) => (
            <i
              key={k.kind}
              style={{ flex: k.count, background: `var(--series-${k.series})` }}
              title={`${k.kind}: ${k.count}`}
            />
          ))}
        </div>
        <ul>
          {kinds.map((k) => (
            <li key={k.kind}>
              <button
                type="button"
                className={`kind-row${filter === k.kind ? " on" : ""}`}
                onClick={() => onFilter(filter === k.kind ? null : k.kind)}
                aria-pressed={filter === k.kind}
              >
                <span className="kn">
                  {k.kind}
                  {k.evm && <em>EVM</em>}
                </span>
                <span className="kb">
                  <i
                    style={{
                      width: `${Math.max(1.5, (k.count / max) * 100)}%`,
                      background: `var(--series-${k.series})`,
                    }}
                  />
                </span>
                <span className="kc mono">{fmt(k.count)}</span>
                <span className="kp mono">
                  {((k.count / Math.max(total, 1)) * 100).toFixed(1)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ActivityPanel({
  buckets,
  size,
  fromBlock,
  toBlock,
  native,
  token,
}: {
  buckets: readonly ActivityBucket[];
  size: number;
  fromBlock: number;
  toBlock: number;
  native: number;
  token: number;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.native + b.token));
  const w = 100 / Math.max(buckets.length, 1);
  return (
    <section className="panel grow">
      <div className="ph">
        <h2>Activity</h2>
        <span className="legend">
          <span>
            <b className="n">Native</b> {fmt(native)}
          </span>
          <span>
            <b className="t">Token</b> {fmt(token)}
          </span>
        </span>
      </div>
      <div className="activity">
        <div className="plot">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label="Rows per block range"
          >
            {buckets.map((b, i) => {
              const hn = (b.native / max) * 100;
              const ht = (b.token / max) * 100;
              return (
                <g key={b.fromBlock}>
                  <title>{`#${fmt(b.fromBlock)}: ${b.native} native, ${b.token} token`}</title>
                  <rect
                    x={i * w + w * 0.15}
                    y={100 - hn}
                    width={w * 0.7}
                    height={hn}
                    fill="var(--blue)"
                  />
                  {ht > 0 && (
                    <rect
                      x={i * w + w * 0.15}
                      y={100 - hn - ht}
                      width={w * 0.7}
                      height={ht}
                      fill="var(--series-6)"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="axis mono">
          <span>#{fmt(fromBlock)}</span>
          <span>rows per {fmt(size)} blocks</span>
          <span>#{fmt(toBlock)}</span>
        </div>
      </div>
    </section>
  );
}

export function ProofBar({ history }: { history: HistoryState }) {
  const r = history.reconciliation;
  const s = history.source;
  let text: string;
  if (history.phase === "error") text = `Stopped: ${history.error}`;
  else if (!s) text = "Loading the history from Portaldot. Rows appear as they are decoded.";
  else if (!r)
    text = `Loaded by ${s.mode} sync in ${formatDuration(s.ms)}. Reconciling balances against the chain…`;
  else if (r.ok)
    text = `Every balance matches Portaldot V3 state (${fmt(r.checks)} account checks). Loaded by ${s.mode} sync in ${formatDuration(s.ms)}, reconciled in ${formatDuration(r.ms)}.`;
  else
    text = `${fmt(r.failed.length)} of ${fmt(r.checks)} account checks do not match the chain. This history is not trustworthy.`;
  return (
    <div className={`proof${r && !r.ok ? " bad" : ""}`}>
      <span className="t">
        <Icon name="shield" />
        Proof
      </span>
      <p>{text}</p>
    </div>
  );
}
