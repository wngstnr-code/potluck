"use client";

import { motion } from "motion/react";
import Link from "next/link";
import NavIcon, { type NavIconName } from "@/components/v1/NavIcons";
import { PANTRY_URL, REPO_URL, WASIAT_URL } from "@/components/v1/nav-config";
import RegisterCue from "@/components/v1/sections/Events/RegisterCue";
import Section from "@/components/v1/sections/shared/Section";
import SectionHeader from "@/components/v1/sections/shared/SectionHeader";
import { HOME_SECTION_TITLE } from "@/components/v1/sections/shared/sectionTitle";
import { CURSOR_TILT_SEED, onCursorTiltLeave, onCursorTiltMove } from "@/utils/v1/cursorFx";
import { reveals } from "@/utils/v1/reveals";

/**
 * Homepage use-case band: six clickable cards (icon + title + body +
 * "Try it →" cue), each linking to the live app page or repo path that
 * shows that use case working. Only use cases an existing spec or app
 * already covers are listed.
 */

interface UseCase {
  id: string;
  title: string;
  body: string;
  href: string;
  icon: NavIconName;
}

const USE_CASES: UseCase[] = [
  {
    id: "account-history",
    title: "Wallet & account history",
    body: "Every DOT balance change of an account, reconciled to the planck against Asset Hub.",
    href: `${PANTRY_URL}#verify`,
    icon: "verify",
  },
  {
    id: "inheritance",
    title: "Inheritance & recovery",
    body: "Recovery timelines from Kusama Asset Hub, rebuilt from storage and replayed 133 / 133.",
    href: WASIAT_URL,
    icon: "key",
  },
  {
    id: "tokens",
    title: "Token & NFT transfers",
    body: "ERC-20 and ERC-721 Transfer logs from pallet-revive contracts, in the same pipeline as native POT.",
    href: `${PANTRY_URL}#overview`,
    icon: "storage",
  },
  {
    id: "dashboards",
    title: "Static dashboards",
    body: "Ship a dashboard as static files: the data comes from Portaldot, not from your server.",
    href: `${PANTRY_URL}#catalog`,
    icon: "agent-evals",
  },
  {
    id: "audits",
    title: "Audits & reconciliation",
    body: "Every row sums to the on-chain balance; a forged row shows up as the exact amount it hides.",
    href: `${PANTRY_URL}#attack`,
    icon: "observability",
  },
  {
    id: "your-dapp",
    title: "Your dApp’s history",
    body: "Describe your events in a JSON spec, build, publish to Portaldot. Same spec, same rawHash.",
    href: `${REPO_URL}/tree/main/specs`,
    icon: "spec",
  },
];

export default function UseCaseBand() {
  return (
    <Section aria-labelledby="home-use-cases-heading" className="relative">
      <SectionHeader
        id="home-use-cases-heading"
        titleClassName={HOME_SECTION_TITLE}
        title={
          <>
            Give any dApp its history,
            <br className="hidden sm:inline" /> verified and serverless.
          </>
        }
        body="Write one spec and every user gets a history they can load in seconds and check themselves. No indexer to run, no API to rent."
        bodyClassName="max-w-[640px]"
      />
      <ul className="mt-v1-stack grid grid-cols-1 gap-x-6 gap-y-8 pl-0 sm:grid-cols-2 lg:grid-cols-3">
        {USE_CASES.map((u, i) => (
          <motion.li key={u.id} {...reveals.item(i)} className="list-none">
            <UseCaseCard useCase={u} />
          </motion.li>
        ))}
      </ul>
    </Section>
  );
}

function UseCaseCard({ useCase }: { useCase: UseCase }) {
  // Whole-card link — anywhere on the card navigates to useCase.href;
  // the "Try it →" cue is presentational and reacts to the card's
  // `group/card` hover. Accessibility: aria-label restated, focus-visible ring.
  return (
    <Link
      href={useCase.href}
      aria-label={`${useCase.title}: try it`}
      onPointerMove={onCursorTiltMove}
      onPointerLeave={onCursorTiltLeave}
      style={CURSOR_TILT_SEED}
      className="group/card relative isolate flex h-full flex-col items-start justify-between gap-8 rounded-md border border-transparent p-5 hover:border-v1-frost/[0.18] hover:shadow-[0_28px_60px_-32px_rgba(0,0,0,0.55)] hover:[--lift:-4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-v1-frost/30 motion-safe:transition-[transform,border-color,box-shadow] motion-safe:duration-[500ms] motion-safe:ease-v1-in"
    >
      {/* Cursor sheen — frost wash that tracks the pointer. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-0 rounded-md opacity-0 group-hover/card:opacity-100 motion-safe:transition-opacity motion-safe:duration-[420ms]"
        style={{
          background:
            "radial-gradient(360px circle at var(--mx) var(--my), rgba(232, 234, 237, 0.08), transparent 60%)",
        }}
      />

      <div className="relative flex flex-col gap-3">
        <span className="mb-2 flex h-9 items-center text-v1-frost">
          <NavIcon name={useCase.icon} width={32} height={32} />
        </span>
        <h3 className="text-v1-heading-sm text-v1-frost">{useCase.title}</h3>
        <p className="text-v1-body-sm">{useCase.body}</p>
      </div>

      <div className="relative">
        <RegisterCue label="Try it" />
      </div>
    </Link>
  );
}
