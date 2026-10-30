import { createPotluck, type Potluck } from "@potluck/client";

const SPEC = "portaldot-v3-testnet.unified-history";
const $ = (id: string) => document.getElementById(id) as HTMLElement;

// Network preset: Portaldot endpoints, the registry and known specs are built in.
const potluck: Potluck = await createPotluck();

// Discovery: every spec registered on chain, fetched from TransactionStorage and hash-checked.
$("specs").replaceChildren(
  ...(await potluck.specs()).map(({ spec, hash, error }) => {
    const li = document.createElement("li");
    li.textContent = spec
      ? `${spec.name} (${spec.source.chain}) · ${hash.slice(0, 10)}…`
      : `${hash}: ${error}`;
    return li;
  }),
);

type Row = Awaited<ReturnType<Potluck["accountHistory"]>>["rows"][number];
const show = (rows: Row[]) =>
  $("rows").prepend(
    ...rows.toReversed().map((row) => {
      const tr = document.createElement("tr");
      for (const value of [
        row.block,
        row.cells.kind,
        row.cells.from,
        row.cells.to,
        row.cells.amount,
      ]) {
        const td = document.createElement("td");
        td.textContent = String(value ?? "");
        td.title = td.textContent;
        tr.append(td);
      }
      return tr;
    }),
  );

let stop: (() => void) | undefined;
$("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  stop?.();
  $("rows").replaceChildren();
  const account = ($("account") as HTMLInputElement).value;
  $("status").textContent = "Loading…";
  try {
    // Snapshot chunks from Portaldot where published, direct sync elsewhere,
    // then L1 integrity, L2 row truth and L3 balance reconciliation against the chain.
    const started = performance.now();
    const history = await potluck.accountHistory({ spec: SPEC, account });
    show(history.rows);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    $("status").textContent =
      `${history.rows.length} rows up to block #${history.head} in ${seconds} s · ` +
      `${history.verified ? "verified against the chain ✓" : "verification FAILED ✗"} · following new blocks…`;
    // Live tail: new finalized rows for the same account.
    stop = await potluck.follow({ spec: SPEC, account, afterBlock: history.head, onRows: show });
  } catch (error) {
    $("status").textContent = String(error);
  }
});
