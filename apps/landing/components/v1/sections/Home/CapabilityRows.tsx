"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import NavIcon, { type NavIconName } from "@/components/v1/NavIcons";
import CapabilityTrace, { type TraceLine } from "@/components/v1/sections/Home/CapabilityTrace";
import GradientFrame from "@/components/v1/sections/shared/GradientFrame";
import Section from "@/components/v1/sections/shared/Section";
import SectionHeader from "@/components/v1/sections/shared/SectionHeader";
import { HOME_SECTION_TITLE } from "@/components/v1/sections/shared/sectionTitle";
import { cn } from "@/utils/v1/cn";
import { useIsDesktop } from "@/utils/v1/hooks/useIsDesktop";
import { reveals } from "@/utils/v1/reveals";

interface Capability {
  /** Anchor id — the header's Product menu links here. */
  id: string;
  label: string;
  heading: string;
  body: string;
  icon: NavIconName;
  traceTitle: string;
  trace: TraceLine[];
}

const CAPABILITIES: Capability[] = [
  {
    id: "verify",
    label: "Verifiable history",
    heading: "Know it’s true",
    icon: "verify",
    body: "L1 checks every chunk’s hashes, L2 re-derives an account’s rows from their blocks, and L3 reconciles every balance against the chain itself. A forged chunk is caught to the exact amount.",
    traceTitle: "pantry · verify",
    trace: [
      { text: "// an honest account", comment: true },
      { text: "L1  digest · rawHash · bloom", note: "ok", tone: "ok" },
      { text: "L2  rows re-derived from blocks", note: "183 / 183", tone: "ok" },
      { text: "L3  Σ rows = Δ System.Account", note: "exact · 1.8 s", tone: "ok" },
      { text: "" },
      { text: "// a forged chunk, re-hashed by the forger", comment: true },
      { text: "L1  digest · rawHash · bloom", note: "passes", tone: "info" },
      { text: "L2  rows re-derived from blocks", note: "passes", tone: "info" },
      { text: "L3  accounts reconcile", note: "903 / 904 ✗", tone: "fail" },
      { text: "    off by exactly the hidden amount", comment: true },
    ],
  },
  {
    id: "portaldot",
    label: "Portaldot data layer",
    heading: "Know where it lives",
    icon: "storage",
    body: "Chunks live in Portaldot’s TransactionStorage, manifests in a PotluckRegistry contract on pallet-revive, and browsers fetch them with bitswap_v1_get. No server, no bucket, no API key.",
    traceTitle: "publish · portaldot-v3",
    trace: [
      { text: "// publisher, once", comment: true },
      { text: "transactionStorage.store(chunk 0)", note: "2.5 MB", tone: "ok" },
      { text: "transactionStorage.store(chunk 1)", note: "0.65 MB", tone: "ok" },
      { text: "utility.batchAll([", comment: false },
      { text: "  transactionStorage.store(manifest),", note: "", tone: "ok" },
      { text: "  revive.call(PotluckRegistry.publish)", note: "manifest #3", tone: "ok" },
      { text: "])" },
      { text: "" },
      { text: "// every browser, after", comment: true },
      { text: "registry 0xef93…82eb → manifest #3", note: "eth_call", tone: "info" },
      { text: "bitswap_v1_get(chunk 0 CID)", note: "2.5 MB · ≈ 4 s", tone: "ok" },
    ],
  },
  {
    id: "sync",
    label: "Adaptive sync",
    heading: "Know what’s fastest",
    icon: "crons",
    body: "Direct sync when a chain is cheap (Portaldot V3: genesis to head in a browser), snapshots when it’s heavy, and a live tail of new finalized blocks either way.",
    traceTitle: "client · coverage plan",
    trace: [
      { text: "portaldot-v3 · unified-history", comment: true },
      { text: "snapshot  #1 – #129,069", note: "manifest #2", tone: "info" },
      { text: "direct    #129,070 – head", note: "live tail", tone: "ok" },
      { text: "mixed sync, L3 938 / 938", note: "3.0 s", tone: "ok" },
      { text: "" },
      { text: "polkadot-asset-hub · balance-history", comment: true },
      { text: "snapshot  #22,021,128 – #22,101,127", note: "manifest #3", tone: "info" },
      { text: "direct    #22,101,128 – head", note: "live tail", tone: "ok" },
      { text: "80,000 blocks from the snapshot", note: "not ≈ 11 min", tone: "ok" },
    ],
  },
  {
    id: "specs",
    label: "Declarative specs",
    heading: "Know what’s indexed",
    icon: "spec",
    body: "One JSON file says which events become which rows and how they reconcile. No handler code: the same spec over the same blocks gives the same rawHash on any machine.",
    traceTitle: "specs/polkadot-ah.balance-history.json",
    trace: [
      { text: "{" },
      { text: '  "source": { "chain": "polkadot-asset-hub",' },
      { text: '              "fromBlock": 11405259 },' },
      { text: '  "columns": ["kind", "from", "to", "amount"],' },
      { text: '  "match": [' },
      { text: '    { "pallet": "Balances", "event": "Transfer" },', note: "row", tone: "ok" },
      { text: '    { "pallet": "System", "event": "KilledAccount",', note: "reset", tone: "info" },
      { text: '      "effect": "reset" }, …' },
      { text: "  ]," },
      { text: '  "reconcile": { "storage": "System.Account" }' },
      { text: "}" },
    ],
  },
];

/**
 * Capabilities chapter — the homepage's one full-bleed colour moment.
 *
 * A brand-blue slab runs edge to edge behind the section header. It
 * starts inside the previous (demo) section's bottom padding, so the
 * demo video appears to rest on it, and ends partway down the first
 * step, so the content appears to rise out of it. The slab is a solid
 * `accent-blue` fill plus the Figma pixel-dissolve PNG anchored at the
 * right edge; the fill is what makes it hold at any viewport width.
 *
 * Below the header, the four capabilities are told as a sequence —
 * know what happened → what to run → what's safe → what works — as
 * scroll-driven rows at lg+: copy left, that step's video right, a
 * step rail down the edge (the same "steps of a run" idea as the
 * hero's trace). Every video stays visible; the row in focus is
 * full-contrast and the only one playing, the rest dim together. Below
 * lg the rows become stacked cards, video over copy.
 */
export default function Capabilities() {
  const isDesktop = useIsDesktop();
  const [active, setActive] = useState(0);

  return (
    <Section
      aria-labelledby="home-capabilities-heading"
      className="relative"
      containerClassName="relative"
    >
      <div className="relative">
        <BlueSlab />
        <SectionHeader
          id="home-capabilities-heading"
          title={<>Everything an indexer does; nothing you have to trust.</>}
          titleClassName={cn(HOME_SECTION_TITLE, "max-w-[1120px]")}
          className="relative"
        />
      </div>

      {/* Desktop: scroll-driven rows. Each row carries its own video; the
          row in focus is full-contrast, the others dim as one. */}
      <ol className="relative mt-v1-stack hidden list-none pl-0 lg:block">
        {CAPABILITIES.map((capability, i) => (
          <Step
            key={capability.id}
            capability={capability}
            index={i}
            isActive={i === active}
            isPast={i < active}
            onInView={() => setActive(i)}
            enabled={isDesktop}
          />
        ))}
      </ol>

      {/* Mobile / tablet: stacked cards. */}
      <ul className="relative mt-v1-stack flex list-none flex-col gap-6 pl-0 lg:hidden">
        {CAPABILITIES.map((capability, i) => (
          <motion.li
            key={capability.id}
            {...reveals.item(i)}
            // Below lg the rows are hidden, so the card carries the anchor.
            id={isDesktop ? undefined : capability.id}
            className="list-none scroll-mt-24"
          >
            <StackedCard capability={capability} enabled={!isDesktop} />
          </motion.li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * Full-bleed blue backdrop. Breaks out of the contained column with the
 * `left-1/2 w-screen -translate-x-1/2` trick, then extends a little above
 * the header (into this section's top padding, clear of "How it works")
 * and below it (the 48px header→content gap plus 96px into the first row
 * / card).
 */
function BlueSlab() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-[6rem] -top-[4rem] left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-v1-accent-blue sm:-top-[5rem] lg:-bottom-[9rem] lg:-top-[7rem]"
    />
  );
}

/** Icon + label row, in the eyebrow colour. */
function Eyebrow({ capability }: { capability: Capability }) {
  return (
    <p className="flex items-center gap-2.5 text-v1-accent-salmon">
      <NavIcon name={capability.icon} width={20} height={20} className="shrink-0" />
      <span className="text-v1-eyebrow uppercase">{capability.label}</span>
    </p>
  );
}

// Parallax travel in px over a full viewport of scroll (see Step).
const PARALLAX_MEDIA = 72;
const PARALLAX_COPY = 20;

/**
 * One row in the desktop sequence: copy on the left, its own video on
 * the right, a rail dot between row and page edge. The row whose box
 * crosses the viewport's middle band is in focus: full-contrast and
 * the only one whose video plays. The others — copy and video together
 * — dim to 40% and hold on their first frame. A light scroll parallax
 * separates the video and copy planes (see the effect below). Rows own
 * their vertical spacing (240px between, as py) rather than using a
 * flex gap so the rail segment each row draws joins the next without a
 * break.
 */
function Step({
  capability,
  index,
  isActive,
  isPast,
  onInView,
  enabled,
}: {
  capability: Capability;
  index: number;
  isActive: boolean;
  isPast: boolean;
  onInView: () => void;
  enabled: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const onInViewRef = useRef(onInView);
  onInViewRef.current = onInView;

  // Parallax: as the row travels through the viewport, its video drifts
  // against the scroll (up to ±PARALLAX_MEDIA px) while the copy drifts
  // a little with it (±PARALLAX_COPY px, opposite sign), so the two
  // planes separate and the row reads as having depth. Writes
  // transforms straight to the DOM from a rAF-throttled scroll
  // listener — no React state per frame. Skipped for reduced motion
  // and while the row has no layout (below lg, where the list is
  // display:none).
  useEffect(() => {
    const el = ref.current;
    const media = mediaRef.current;
    const copy = copyRef.current;
    if (!el || !media || !copy) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0) return;
      const vh = window.innerHeight || 1;
      // -1 when the row's centre is a viewport below the middle, 0 when
      // centred, +1 when a viewport above.
      const p = Math.max(-1, Math.min(1, (vh / 2 - (rect.top + rect.height / 2)) / vh));
      media.style.transform = `translate3d(0, ${(p * PARALLAX_MEDIA).toFixed(1)}px, 0)`;
      copy.style.transform = `translate3d(0, ${(-p * PARALLAX_COPY).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onInViewRef.current();
      },
      // A thin band across the viewport's middle: whichever row
      // overlaps it is the one the reader is looking at.
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const isFirst = index === 0;
  const isLast = index === CAPABILITIES.length - 1;

  return (
    <li
      ref={ref}
      // Only the visible layout carries the anchor id (see the cards below).
      id={enabled ? capability.id : undefined}
      aria-current={isActive ? "step" : undefined}
      className={cn(
        "relative scroll-mt-24 pl-10",
        // The first row gets a small top pad so its copy clears the blue
        // slab (which overlaps the row by 96px) and reads on dark; its
        // video still rises into the blue.
        isFirst ? "pt-12" : "pt-[7.5rem]",
        !isLast && "pb-[7.5rem]",
      )}
    >
      {/* Rail segments: upper half (not on the first row) and lower half
          (not on the last), meeting under the dot at the row's centre. */}
      {!isFirst && (
        <span
          aria-hidden="true"
          className="absolute left-[5px] top-0 h-1/2 w-px bg-v1-frost/[0.12]"
        />
      )}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[5px] h-1/2 w-px bg-v1-frost/[0.12]"
        />
      )}
      {/* Rail dot: solid salmon while in focus, quiet frost once passed,
          dim before. */}
      <span
        aria-hidden="true"
        className={cn(
          "border-v1-canvasBase absolute left-0 top-1/2 size-[11px] -translate-y-1/2 rounded-full border-2",
          "motion-safe:transition-colors motion-safe:duration-500",
          isActive ? "bg-v1-accent-salmon" : isPast ? "bg-v1-frost/60" : "bg-v1-frost/20",
        )}
      />

      <div
        className={cn(
          "grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-center gap-x-12",
          "motion-safe:transition-opacity motion-safe:duration-500 motion-safe:ease-v1-out",
          isActive ? "opacity-100" : "opacity-40",
        )}
      >
        <div
          ref={copyRef}
          className="flex max-w-[480px] flex-col gap-5 motion-safe:[will-change:transform]"
        >
          <div className="flex flex-col gap-3">
            <Eyebrow capability={capability} />
            <h3 className="font-v1Heading text-[clamp(2rem,3vw,2.75rem)] leading-[1.1] tracking-[-0.02em] text-v1-frost">
              {capability.heading}
            </h3>
          </div>
          <p className="text-v1-body-lg-loose !text-v1-frost">{capability.body}</p>
        </div>

        <div ref={mediaRef} className="motion-safe:[will-change:transform]">
          <GradientFrame
            variant="charcoal"
            className="rounded-[10px]"
            innerClassName="relative aspect-video [background-color:rgb(var(--color-v1-bg-canvas-base)/0.85)]"
          >
            <CapabilityTrace
              title={capability.traceTitle}
              lines={capability.trace}
              play={enabled && isActive}
            />
          </GradientFrame>
        </div>
      </div>
    </li>
  );
}

/** Below lg: a plain stacked card, video over copy. Plays when in view. */
function StackedCard({ capability, enabled }: { capability: Capability; enabled: boolean }) {
  return (
    <GradientFrame
      variant="charcoal"
      className="h-full rounded-[10px]"
      innerClassName="flex h-full flex-col [background-color:rgb(var(--color-v1-bg-canvas-base)/0.85)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-v1-frost/[0.08] bg-v1-surfaceElevated sm:aspect-video">
        <CapabilityTrace title={capability.traceTitle} lines={capability.trace} play={enabled} />
      </div>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3">
          <Eyebrow capability={capability} />
          <h3 className="text-v1-heading-sm text-v1-frost">{capability.heading}</h3>
        </div>
        <p className="text-v1-body-sm !text-v1-frost">{capability.body}</p>
      </div>
    </GradientFrame>
  );
}
