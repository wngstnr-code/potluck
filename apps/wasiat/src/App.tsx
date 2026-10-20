import { Shell, type ShellPage } from "@potluck/ui/Shell";
import { useState } from "react";
import { KUSAMA_AH } from "./config";
import { Plans } from "./Plans";
import { Timeline } from "./Timeline";

/** Pages are added to the rail as they are built; nothing here is a placeholder. */
const PAGES: ShellPage[] = [
  { id: "plans", label: "Inheritance plans", icon: "home", section: "Wasiat" },
];

export function App() {
  const [page, setPage] = useState("plans");
  const [account, setAccount] = useState<string | null>(null);
  return (
    <Shell
      brand="wasiat"
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
            <b>{KUSAMA_AH.name}</b>
            <span className="mono">{KUSAMA_AH.ws.replace("wss://", "")}</span>
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
    </Shell>
  );
}
