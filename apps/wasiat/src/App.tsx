import { Shell, type ShellPage } from "@potluck/ui/Shell";
import { useState } from "react";
import { KUSAMA_AH, PORTALDOT } from "./config";
import { Plans } from "./Plans";
import { Setup } from "./Setup";
import { Timeline } from "./Timeline";

/** Pages are added to the rail as they are built; nothing here is a placeholder. */
const PAGES: ShellPage[] = [
  { id: "plans", label: "Inheritance plans", icon: "home", section: "Wasiat" },
  { id: "setup", label: "Set up on Portaldot", icon: "shield", section: "Wasiat" },
];

export function App() {
  const [page, setPage] = useState("plans");
  const [account, setAccountState] = useState<string | null>(null);
  // On phones the whole page scrolls; open a timeline (or go back) at the top.
  const setAccount = (next: string | null) => {
    setAccountState(next);
    window.scrollTo({ top: 0 });
  };
  return (
    <Shell
      links={[{ label: "Pantry", href: "../pantry/", icon: "home" }]}
      brand="wasiat"
      mark="wasiat"
      pages={PAGES}
      page={page}
      onPage={(id) => {
        setPage(id);
        setAccount(null);
      }}
      top={
        <>
          <div className="crumb mono">recovery · inheritance</div>
          <span className="grow" />
          <div className="net">
            <b>{page === "setup" ? PORTALDOT.name : KUSAMA_AH.name}</b>
            <span className="mono">
              {(page === "setup" ? PORTALDOT.ws : KUSAMA_AH.ws).replace("wss://", "")}
            </span>
          </div>
        </>
      }
    >
      {page === "plans" &&
        (account ? (
          <Timeline account={account} onBack={() => setAccount(null)} />
        ) : (
          <Plans onOpen={setAccount} />
        ))}
      {page === "setup" && <Setup />}
    </Shell>
  );
}
