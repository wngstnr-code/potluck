import { type ManifestEntry, PortaldotSource } from "@potluck/client";
import { type Spec, specHash } from "@potluck/spec";
import { fmt, shortHex } from "@potluck/ui/format";
import { Icon } from "@potluck/ui/Icon";
import { useEffect, useMemo, useState } from "react";
import { KindTag } from "./components/RowsTable";
import { PORTALDOT, SPECS, UNIFIED_SPEC } from "./config";
import { useSharedHistory } from "./lib/HistoryContext";
import { seriesOf } from "./lib/kinds";

type Published =
  | { status: "no-registry" }
  | { status: "loading" }
  | { status: "ok"; entries: ManifestEntry[] }
  | { status: "error"; message: string };

/** Manifests per spec from PotluckRegistry, or "no-registry" until it is deployed. */
function usePublished(): Record<string, Published> {
  const { client } = useSharedHistory();
  const [published, setPublished] = useState<Record<string, Published>>(() =>
    Object.fromEntries(
      SPECS.map((s) => [
        s.file,
        { status: PORTALDOT.registry ? "loading" : "no-registry" } as Published,
      ]),
    ),
  );
  useEffect(() => {
    const registry = PORTALDOT.registry;
    if (!registry || !client) return;
    const source = new PortaldotSource({
      portaldot: client,
      evmRpcUrl: PORTALDOT.evmRpc,
      registry,
    });
    for (const { file, spec } of SPECS) {
      source.list(spec).then(
        (entries) => setPublished((p) => ({ ...p, [file]: { status: "ok", entries } })),
        (e: unknown) =>
          setPublished((p) => ({ ...p, [file]: { status: "error", message: String(e) } })),
      );
    }
  }, [client]);
  return published;
}

const label = (p: Published) =>
  p.status === "no-registry"
    ? "Not published"
    : p.status === "loading"
      ? "Checking…"
      : p.status === "error"
        ? "Registry error"
        : p.entries.length === 0
          ? "Not published"
          : `${p.entries.length} manifest${p.entries.length > 1 ? "s" : ""}`;

export function Catalog() {
  const history = useSharedHistory();
  const published = usePublished();
  const [selected, setSelected] = useState(SPECS[0]?.file ?? "");
  const entry = SPECS.find((s) => s.file === selected) ?? SPECS[0];
  const hashes = useMemo(
    () => Object.fromEntries(SPECS.map((s) => [s.file, specHash(s.spec)])),
    [],
  );
  const chains = new Set(SPECS.map((s) => s.spec.source.chain)).size;
  const manifests = Object.values(published).reduce(
    (n, p) => n + (p.status === "ok" ? p.entries.length : 0),
    0,
  );

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>Catalog</h1>
          <p>
            Declarative specs: what to index, from which chain, and how the result is checked
            against that chain.
          </p>
        </div>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="lbl">Specs</span>
          <span className="big mono">{SPECS.length}</span>
          <span className="sub">JSON files in specs/, hashed in this browser</span>
        </div>
        <div className="tile">
          <span className="lbl">Source chains</span>
          <span className="big mono">{chains}</span>
          <span className="sub">{SPECS.map((s) => s.chainLabel).join(" · ")}</span>
        </div>
        <div className="tile yellow">
          <span className="lbl">Manifests on Portaldot</span>
          <span className="big mono">{PORTALDOT.registry ? fmt(manifests) : "0"}</span>
          <span className="sub">
            {PORTALDOT.registry
              ? `registry ${shortHex(PORTALDOT.registry)}`
              : "registry not deployed yet (needs tPOT)"}
          </span>
        </div>
        <div className="tile blue">
          <span className="lbl">Loaded in this browser</span>
          <span className="big mono">{fmt(history.rows.length)}</span>
          <span className="sub">rows of {UNIFIED_SPEC.name}</span>
        </div>
      </div>

      <div className="content">
        <section className="panel">
          <div className="ph">
            <h2>Specs</h2>
            <span>click a spec for its details</span>
          </div>
          <div className="scroll">
            <table className="rows">
              <thead>
                <tr>
                  <th>Spec</th>
                  <th>Source chain</th>
                  <th className="r">From block</th>
                  <th className="r">Events</th>
                  <th>Check</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {SPECS.map((s) => (
                  <tr
                    key={s.file}
                    className={`clickable${s.file === selected ? " sel" : ""}`}
                    onClick={() => setSelected(s.file)}
                    style={{ height: 60 }}
                  >
                    <td>
                      <b className="mono">{s.file}</b>
                      <small className="block muted mono">{shortHex(hashes[s.file])}</small>
                    </td>
                    <td>{s.chainLabel}</td>
                    <td className="mono r">#{fmt(s.spec.source.fromBlock)}</td>
                    <td className="mono r">{s.spec.match.length}</td>
                    <td>
                      {s.spec.reconcile.type === "balance-delta" ? "L1 · L2 · L3" : "L1 · L2"}
                    </td>
                    <td>
                      <span
                        className={`state ${published[s.file]?.status === "ok" && (published[s.file] as { entries: unknown[] }).entries.length ? "on" : "off"}`}
                      >
                        {label(published[s.file] ?? { status: "no-registry" })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entry && <SpecDetail spec={entry.spec} hash={hashes[entry.file] ?? ""} />}
          </div>
        </section>
        <aside className="side">
          <section className="panel grow">
            <div className="ph">
              <h2>Events indexed</h2>
              <span>{entry?.spec.match.length} rules</span>
            </div>
            <ul className="rules">
              {entry?.spec.match.map((m) => {
                const kind = String(m.row.kind ?? "?");
                return (
                  <li key={`${"pallet" in m ? `${m.pallet}.${m.event}` : m.log}`}>
                    <KindTag kind={kind} series={seriesOf(kind)} />
                    <span className="mono">
                      {"pallet" in m ? `${m.pallet}.${m.event}` : `EVM log ${m.log.split("(")[0]}`}
                    </span>
                    {"effect" in m && m.effect && <em>{m.effect}</em>}
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SpecDetail({ spec, hash }: { spec: Spec; hash: string }) {
  const r = spec.reconcile;
  return (
    <div className="spec-detail">
      <p>{spec.description}</p>
      <dl>
        <dt>Spec hash</dt>
        <dd className="mono">{hash}</dd>
        <dt>Source genesis</dt>
        <dd className="mono">{spec.source.genesisHash}</dd>
        <dt>Columns</dt>
        <dd className="mono">{spec.columns.join(" · ")}</dd>
        <dt>Account columns</dt>
        <dd className="mono">{spec.accounts.join(" · ")}</dd>
        <dt>Reconciliation (L3)</dt>
        <dd>
          {r.type === "balance-delta" ? (
            <>
              <span className="mono">{`${r.storage.pallet}.${r.storage.item}`}</span> sum of{" "}
              <span className="mono">{r.sum.join(" + ")}</span>
              {r.when ? (
                <>
                  , rows where <span className="mono">{`${r.when.column} = ${r.when.equals}`}</span>
                </>
              ) : null}
            </>
          ) : (
            "none: rows are checked by L1 and L2 only"
          )}
        </dd>
        <dt>Chunks</dt>
        <dd className="mono">
          ≤ {fmt(spec.chunk.maxBlocks)} blocks · ≤ {fmt(spec.chunk.maxRawBytes / 1_000_000)} MB raw
        </dd>
      </dl>
      <p className="note">
        <Icon name="shield" size={14} /> A manifest is accepted only if it hashes to its registered
        digest and names this spec hash and source genesis.
      </p>
    </div>
  );
}
