import { Shell, type ShellPage } from "@potluck/ui/Shell";
import { useState } from "react";
import { Attack } from "./Attack";
import { Catalog } from "./Catalog";
import { PORTALDOT, UNIFIED_SPEC_NAME } from "./config";
import { Overview } from "./Overview";
import { Verify } from "./Verify";

/** Pages are added to the rail as they are built; nothing here is a placeholder. */
const PAGES: ShellPage[] = [
  { id: "overview", label: "Overview", icon: "home", section: "Pantry" },
  { id: "catalog", label: "Catalog", icon: "list", section: "Pantry" },
  { id: "verify", label: "Verify account", icon: "shield", section: "Pantry" },
  { id: "attack", label: "Attack demo", icon: "bolt", section: "Pantry" },
];

export function App() {
  const [page, setPage] = useState("overview");
  return (
    <Shell
      links={[{ label: "Wasiat-lite", href: "../wasiat/", icon: "user" }]}
      brand="potluck"
      pages={PAGES}
      page={page}
      onPage={setPage}
      top={
        <>
          <div className="crumb mono">{UNIFIED_SPEC_NAME}</div>
          <span className="grow" />
          <div className="net">
            <b>{PORTALDOT.name}</b>
            <span className="mono">{PORTALDOT.ws.replace("wss://", "")}</span>
          </div>
        </>
      }
    >
      {page === "overview" && <Overview />}
      {page === "verify" && <Verify />}
      {page === "attack" && <Attack />}
      {page === "catalog" && <Catalog />}
    </Shell>
  );
}
