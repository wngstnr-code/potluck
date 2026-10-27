import { Shell, type ShellPage } from "@potluck/ui/Shell";
import { useEffect, useState } from "react";
import { Attack } from "./Attack";
import { Catalog } from "./Catalog";
import { AH_SPEC_NAME, POLKADOT_AH, PORTALDOT, UNIFIED_SPEC_NAME } from "./config";
import { Heavy } from "./Heavy";
import { Overview } from "./Overview";
import { Verify } from "./Verify";

/** Pages are added to the rail as they are built; nothing here is a placeholder. */
const PAGES: ShellPage[] = [
  { id: "overview", label: "Overview", icon: "home", section: "Pantry" },
  { id: "catalog", label: "Catalog", icon: "list", section: "Pantry" },
  { id: "verify", label: "Verify account", icon: "shield", section: "Pantry" },
  { id: "attack", label: "Attack demo", icon: "bolt", section: "Pantry" },
  { id: "polkadot", label: "Polkadot AH", icon: "layers", section: "Pantry" },
];

/** The page named by the URL hash (`#verify`), so other sites can link straight to a page. */
function pageFromHash(): string {
  const id = window.location.hash.slice(1);
  return PAGES.some((p) => p.id === id) ? id : "overview";
}

export function App() {
  const [page, setPageState] = useState(pageFromHash);
  useEffect(() => {
    const onHash = () => setPageState(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const setPage = (id: string) => {
    setPageState(id);
    history.replaceState(null, "", `#${id}`);
  };
  return (
    <Shell
      links={[{ label: "Wasiat-lite", href: "../wasiat/", icon: "user" }]}
      brand="potluck"
      pages={PAGES}
      page={page}
      onPage={setPage}
      top={
        <>
          <div className="crumb mono">{page === "polkadot" ? AH_SPEC_NAME : UNIFIED_SPEC_NAME}</div>
          <span className="grow" />
          <div className="net">
            <b>{page === "polkadot" ? POLKADOT_AH.name : PORTALDOT.name}</b>
            <span className="mono">
              {(page === "polkadot" ? POLKADOT_AH.ws : PORTALDOT.ws).replace("wss://", "")}
            </span>
          </div>
        </>
      }
    >
      {page === "overview" && <Overview />}
      {page === "verify" && <Verify />}
      {page === "attack" && <Attack />}
      {page === "catalog" && <Catalog />}
      {page === "polkadot" && <Heavy />}
    </Shell>
  );
}
