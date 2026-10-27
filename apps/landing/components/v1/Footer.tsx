import FooterDotSphere from "@/components/v1/FooterDotSphereLazy";
import Link from "@/components/v1/Link";
import { PANTRY_URL, REPO_URL, WASIAT_URL } from "@/components/v1/nav-config";
import { WipeLabel } from "@/components/v1/sections/shared/WipeLabel";

interface FooterLink {
  label: string;
  href: string;
  /** Disable Next.js Link prefetch — set true for routes that don't
   *  exist yet (planned IA) or that redirect off-domain. Without
   *  this, hover-prefetch logs 404 / CORS errors in DevTools. */
  noPrefetch?: boolean;
}

interface FooterColumnDef {
  heading: string;
  links: FooterLink[];
}

const COLUMN_PRODUCT: FooterColumnDef = {
  heading: "Product",
  links: [
    { label: "Verifiable history", href: "/#verify" },
    { label: "Portaldot data layer", href: "/#portaldot" },
    { label: "Adaptive sync", href: "/#sync" },
    { label: "Declarative specs", href: "/#specs" },
    { label: "How it works", href: "/#how-it-works" },
  ],
};

const COLUMN_DEMOS: FooterColumnDef = {
  heading: "Demos",
  links: [
    { label: "Pantry overview", href: `${PANTRY_URL}#overview` },
    { label: "Polkadot Asset Hub", href: `${PANTRY_URL}#polkadot` },
    { label: "Verify an account", href: `${PANTRY_URL}#verify` },
    { label: "Attack demo", href: `${PANTRY_URL}#attack` },
    { label: "Wasiat-lite", href: WASIAT_URL },
  ],
};

const COLUMN_PROJECT: FooterColumnDef = {
  heading: "Project",
  links: [
    { label: "GitHub repo", href: REPO_URL },
    { label: "Architecture", href: `${REPO_URL}/blob/main/docs/ARCHITECTURE.md` },
    { label: "Development log", href: `${REPO_URL}/blob/main/docs/DEVELOPMENT.md` },
    { label: "Specs", href: `${REPO_URL}/tree/main/specs` },
    {
      label: "PotluckRegistry ↗",
      href: "https://node-console.portaldot.dev/#/explorer/query/129014",
    },
  ],
};

export default function Footer() {
  return (
    <footer className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 36%, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 36%, black 100%)",
        }}
      >
        <FooterDotSphere />
      </div>

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-12 px-6 pb-8 pt-10 lg:px-8 lg:pt-20">
        <div className="grid grid-cols-2 items-start gap-x-[42px] gap-y-[34px] md:grid-cols-3 md:gap-x-12 md:gap-y-12 lg:gap-x-40">
          <FooterCol {...COLUMN_PRODUCT} />
          <FooterCol {...COLUMN_DEMOS} />
          <FooterCol {...COLUMN_PROJECT} />
        </div>

        <div className="flex flex-col items-center gap-2 text-center lg:flex-row lg:justify-between lg:text-left">
          <p className="text-v1-caption text-v1-frost">&copy;{new Date().getFullYear()} Potluck</p>
          <p className="text-v1-caption text-v1-frost/70">Built for Portaldot Hacker House 2026</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ heading, links }: FooterColumnDef) {
  return (
    <div>
      <h2 className="mb-5 font-v1Heading text-[26px] leading-[1.2] tracking-[-0.01em] text-v1-frost lg:mb-8">
        {heading}
      </h2>
      <ul className="flex flex-col gap-0 lg:gap-4">
        {links.map((link) => {
          const external = link.href.startsWith("http");
          return (
            <li key={link.label}>
              {/* `WipeLabel` (React element child) bypasses Link's
                  auto-wrap-in-BleedLabel — footer links use the same
                  left-to-right salmon wipe as the header nav, not
                  the radial bleed effect. */}
              <Link
                href={link.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                prefetch={link.noPrefetch ? false : undefined}
                className="text-v1-caption text-v1-frost lg:text-v1-body-sm"
              >
                <WipeLabel>{link.label}</WipeLabel>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
