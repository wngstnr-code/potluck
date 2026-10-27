/**
 * Shared v1 header nav config — consumed by the desktop `Header`
 * (hover/focus mega-menus) and the `MobileMenu` drawer (accordion) so
 * both surfaces stay in lockstep.
 *
 * Menu shapes:
 *   - Product — icon list of the landing's own sections (anchor links)
 *   - Demos   — icon list of the live apps on GitHub Pages
 */

import type { NavIconName } from "@/components/v1/NavIcons";

export interface NavMenuItem {
  label: string;
  href: string;
  /** Secondary line under the label (icon lists + columns). */
  description?: string;
  /** Leading 24×24 glyph (Platform / Use Cases rows). */
  icon?: NavIconName;
  /** Compact status chip beside the label (e.g. "Open beta"). */
  tag?: string;
}

export interface NavMenuColumn {
  heading: string;
  items: NavMenuItem[];
}

export interface NavPromo {
  title: string;
  description: string;
  /** `/public` path; rendered through next/image (fill). */
  image: string;
  href?: string;
  /** Use Cases card bleeds (cover); Resources sits a logo card on white. */
  fit?: "cover" | "contain";
}

export interface NavMenu {
  /** Fixed panel width (px) for trigger-anchored menus. */
  width?: number;
  /** Span the header content box instead of anchoring to the trigger. */
  fullWidth?: boolean;
  /** Anchor edge relative to the trigger. Default "left". */
  align?: "left" | "right";
  /** Single column of items (Platform, Use Cases, Open Source). */
  items?: NavMenuItem[];
  /** Render the item titles a step smaller (e.g. the Open Source repo
   *  list, which is a dense list of long repo slugs). */
  compact?: boolean;
  /** Multi-column layout (Resources). */
  columns?: NavMenuColumn[];
  /** Promo card to the right of the items/columns. */
  promo?: NavPromo;
}

export interface NavItem {
  label: string;
  href: string;
  /** Present → renders a hover/focus mega-menu trigger (with chevron). */
  menu?: NavMenu;
  /** Show the GitHub mark + total star count before the chevron (Open Source). */
  githubStars?: boolean;
}

/** Where the live apps are hosted (GitHub Pages); override for local previews. */
export const APPS_BASE =
  process.env.NEXT_PUBLIC_APPS_BASE ?? "https://wngstnr-code.github.io/potluck";

export const REPO_URL = "https://github.com/wngstnr-code/potluck";

export const PANTRY_URL = `${APPS_BASE}/pantry/`;
export const WASIAT_URL = `${APPS_BASE}/wasiat/`;

const PRODUCT_MENU: NavMenu = {
  width: 420,
  items: [
    {
      label: "Verifiable history",
      href: "/#verify",
      description: "Every chunk checked against the source chain",
      icon: "verify",
    },
    {
      label: "Portaldot data layer",
      href: "/#portaldot",
      description: "TransactionStorage blobs + a Revive registry",
      icon: "storage",
    },
    {
      label: "Adaptive sync",
      href: "/#sync",
      description: "Direct sync when cheap, snapshots when heavy",
      icon: "crons",
    },
    {
      label: "Declarative specs",
      href: "/#specs",
      description: "One JSON file describes a dApp's history",
      icon: "spec",
    },
  ],
};

const DEMOS_MENU: NavMenu = {
  width: 420,
  items: [
    {
      label: "Pantry overview",
      href: `${PANTRY_URL}#overview`,
      description: "Portaldot V3 history synced in your browser",
      icon: "background-jobs",
    },
    {
      label: "Polkadot Asset Hub",
      href: `${PANTRY_URL}#polkadot`,
      description: "Load a heavy chain from its Portaldot snapshot",
      icon: "storage",
    },
    {
      label: "Verify an account",
      href: `${PANTRY_URL}#verify`,
      description: "Row truth and balance reconciliation, live",
      icon: "verify",
    },
    {
      label: "Attack demo",
      href: `${PANTRY_URL}#attack`,
      description: "A forged chunk, caught to the exact amount",
      icon: "bolt",
    },
    {
      label: "Wasiat-lite",
      href: WASIAT_URL,
      description: "Inheritance timelines from Kusama Asset Hub",
      icon: "key",
    },
  ],
};

export const NAV_PRIMARY: NavItem[] = [
  { label: "Product", href: "/#verify", menu: PRODUCT_MENU },
  { label: "Demos", href: PANTRY_URL, menu: DEMOS_MENU },
  { label: "How it works", href: "/#how-it-works" },
];
