import { type ReactNode, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { PotluckMark } from "./Logo";

/** A link to a sibling app, shown in the rail's "Apps" section. */
export interface ShellLink {
  label: string;
  href: string;
  icon: IconName;
}

export interface ShellPage {
  id: string;
  label: string;
  icon: IconName;
  section: string;
}

const RAIL_KEY = "potluck.rail";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/**
 * Full-screen app shell (docs/DESIGN.md): navy rail with sections and a collapse toggle whose state
 * is remembered, a top bar, and the current page. Pages are listed only once they exist.
 */
export function Shell({
  brand,
  pages,
  page,
  onPage,
  top,
  links = [],
  children,
}: {
  brand: string;
  links?: readonly ShellLink[];
  pages: readonly ShellPage[];
  page: string;
  onPage: (id: string) => void;
  top: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
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
  const sections = [...new Set(pages.map((p) => p.section))];

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <nav className="rail" aria-label="Main">
        <div className="brandrow">
          <div className="logo">
            <PotluckMark />
          </div>
          <b className="label">{brand}</b>
        </div>
        {sections.map((section) => (
          <div key={section} className="navgroup">
            <div className="section">{section}</div>
            {pages
              .filter((p) => p.section === section)
              .map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`rb${page === p.id ? " on" : ""}`}
                  title={p.label}
                  aria-current={page === p.id ? "page" : undefined}
                  onClick={() => onPage(p.id)}
                >
                  <Icon name={p.icon} size={19} />
                  <span className="label">{p.label}</span>
                </button>
              ))}
          </div>
        ))}
        {links.length > 0 && (
          <div className="navgroup">
            <div className="section">Apps</div>
            {links.map((l) => (
              <a key={l.href} className="rb" href={l.href} title={l.label}>
                <Icon name={l.icon} size={19} />
                <span className="label">{l.label}</span>
              </a>
            ))}
          </div>
        )}
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
        <div className="top">{top}</div>
        {children}
      </main>
    </div>
  );
}
