import { useState } from "react";
import { Attack } from "./Attack";
import { Icon, type IconName } from "./components/Icon";
import { PORTALDOT, UNIFIED_SPEC_NAME } from "./config";
import { Overview } from "./Overview";
import { Verify } from "./Verify";

const RAIL_KEY = "potluck.rail";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** Pages are added to the rail as they are built; nothing here is a placeholder. */
const PAGES: { id: string; label: string; icon: IconName; section: string }[] = [
  { id: "overview", label: "Overview", icon: "home", section: "Pantry" },
  { id: "verify", label: "Verify account", icon: "shield", section: "Pantry" },
  { id: "attack", label: "Attack demo", icon: "bolt", section: "Pantry" },
];

export function App() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [page, setPage] = useState("overview");
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(RAIL_KEY, c ? "expanded" : "collapsed");
      } catch {
        // Storage unavailable (private mode): the toggle still works for this visit.
      }
      return !c;
    });
  };
  const sections = [...new Set(PAGES.map((p) => p.section))];

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <nav className="rail" aria-label="Main">
        <div className="brandrow">
          <div className="logo">p</div>
          <b className="label">potluck</b>
        </div>
        {sections.map((section) => (
          <div key={section} className="navgroup">
            <div className="section">{section}</div>
            {PAGES.filter((p) => p.section === section).map((p) => (
              <button
                type="button"
                key={p.id}
                className={`rb${page === p.id ? " on" : ""}`}
                title={p.label}
                aria-current={page === p.id ? "page" : undefined}
                onClick={() => setPage(p.id)}
              >
                <Icon name={p.icon} size={19} />
                <span className="label">{p.label}</span>
              </button>
            ))}
          </div>
        ))}
        <span className="grow" />
        <button
          type="button"
          className="rb toggle"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <span className="flip">
            <Icon name="collapse" size={19} />
          </span>
          <span className="label">{collapsed ? "Expand" : "Collapse"}</span>
        </button>
      </nav>
      <main className="main">
        <div className="top">
          <div className="crumb mono">{UNIFIED_SPEC_NAME}</div>
          <span className="grow" />
          <div className="net">
            <b>{PORTALDOT.name}</b>
            <span className="mono">{PORTALDOT.ws.replace("wss://", "")}</span>
          </div>
        </div>
        {page === "overview" && <Overview />}
        {page === "verify" && <Verify />}
        {page === "attack" && <Attack />}
      </main>
    </div>
  );
}
