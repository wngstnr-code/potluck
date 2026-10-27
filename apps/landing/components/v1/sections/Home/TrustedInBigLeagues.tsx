"use client";

import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import Link from "@/components/v1/Link";
import { REPO_URL } from "@/components/v1/nav-config";
import GradientFrame from "@/components/v1/sections/shared/GradientFrame";
import Section from "@/components/v1/sections/shared/Section";
import { HOME_SECTION_TITLE } from "@/components/v1/sections/shared/sectionTitle";
import { cn } from "@/utils/v1/cn";
import { reveals } from "@/utils/v1/reveals";
import { tweens, V1_CYCLE_MS } from "@/utils/v1/springs";

/**
 * "Proof, not promises" (three auto-cycling topics, each with a
 * visualization drawn from real build data) + "On-chain. Check it
 * yourself." (deployment facts with explorer links) share one card.
 */

type TopicId = "reconciled" | "rows" | "coverage";

interface Topic {
  id: TopicId;
  title: string;
  /** Single line of copy; wraps naturally within the column. */
  body: string;
  visualization: ReactNode;
}

const TOPICS: Topic[] = [
  {
    id: "reconciled",
    title: "Reconciled, chunk by chunk",
    body: "1.5 M Polkadot AH blocks in 30 chunks: every account in every chunk matches the chain.",
    visualization: <ChunkBars />,
  },
  {
    id: "rows",
    title: "Canonical rows",
    body: "Plain NDJSON in a fixed key order, so the same blocks always hash to the same rawHash.",
    visualization: <CanonicalRows />,
  },
  {
    id: "coverage",
    title: "Coverage you can see",
    body: "Published snapshots, the verified build waiting to publish, and the live tail on top.",
    visualization: <CoverageTimeline />,
  },
];

const CYCLE_MS = V1_CYCLE_MS;

export default function TrustedInBigLeagues() {
  const [active, setActive] = useState<TopicId>("reconciled");
  // Bumped on every topic change so the progress bar + viz replay
  // their keyframes via key change — decoupled from `active` so
  // re-selecting the same topic doesn't replay.
  const [cycleNonce, setCycleNonce] = useState(0);
  const [userTookControl, setUserTookControl] = useState(false);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const hasEnteredRef = useRef(false);
  const current = TOPICS.find((t) => t.id === active) ?? TOPICS[0];

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: "0px 0px -10% 0px",
      threshold: 0.12,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Replay the initial viz draw-in once the section enters view, so
  // it doesn't finish silently while scrolling.
  useEffect(() => {
    if (inView && !hasEnteredRef.current) {
      hasEnteredRef.current = true;
      setCycleNonce((n) => n + 1);
    }
  }, [inView]);

  // Auto-cycle topics; stops permanently once the user takes control.
  useEffect(() => {
    if (!inView) return;
    if (userTookControl) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = window.setInterval(() => {
      setActive((prev) => {
        const idx = TOPICS.findIndex((t) => t.id === prev);
        const next = TOPICS[(idx + 1) % TOPICS.length].id;
        return next;
      });
      setCycleNonce((n) => n + 1);
    }, CYCLE_MS);
    return () => window.clearInterval(interval);
  }, [userTookControl, inView]);

  const handleSelect = (id: TopicId) => {
    setActive(id);
    setCycleNonce((n) => n + 1);
    setUserTookControl(true);
  };

  return (
    <Section ref={sectionRef} aria-label="Proof, not promises" className="relative">
      <GradientFrame
        variant="black"
        className="rounded-[10px]"
        innerClassName="flex flex-col gap-[52px] py-11 px-4 lg:pt-16 lg:pb-2.5 lg:px-8"
      >
        <TrustedBlock
          active={active}
          onSelect={handleSelect}
          current={current}
          cycleNonce={cycleNonce}
          showProgress={!userTookControl}
        />
        <CisoBlock />
      </GradientFrame>
    </Section>
  );
}

function TrustedBlock({
  active,
  onSelect,
  current,
  cycleNonce,
  showProgress,
}: {
  active: TopicId;
  onSelect: (id: TopicId) => void;
  current: Topic;
  cycleNonce: number;
  showProgress: boolean;
}) {
  return (
    <div className="flex flex-col gap-[52px]">
      <motion.h2 {...reveals.heading} className={cn("text-balance", HOME_SECTION_TITLE)}>
        Proof, not promises
      </motion.h2>

      <div className="flex flex-col gap-[28px] lg:pb-[19px]">
        <TopicRow
          active={active}
          onSelect={onSelect}
          cycleNonce={cycleNonce}
          showProgress={showProgress}
        />

        {/* AnimatePresence + mode="wait" coordinates the swap-out and
            swap-in so they don't overlap in flow. Keyed on the viz id
            (cycleNonce isn't needed — replaying the SAME viz is fine
            via internal IO + key on the inner div). */}
        <VisualizationCard>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${current.id}-${cycleNonce}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={tweens.entry}
              className="flex w-full justify-center"
            >
              {current.visualization}
            </motion.div>
          </AnimatePresence>
        </VisualizationCard>
      </div>
    </div>
  );
}

function TopicRow({
  active,
  onSelect,
  cycleNonce,
  showProgress,
}: {
  active: TopicId;
  onSelect: (id: TopicId) => void;
  cycleNonce: number;
  showProgress: boolean;
}) {
  return (
    <div
      className="
        grid grid-cols-1 gap-[45px]
        md:grid-cols-3 md:items-stretch
      "
    >
      {TOPICS.map((topic) => (
        <TopicItem
          key={topic.id}
          topic={topic}
          isActive={topic.id === active}
          onSelect={() => onSelect(topic.id)}
          cycleNonce={cycleNonce}
          showProgress={showProgress}
        />
      ))}
    </div>
  );
}

function TopicItem({
  topic,
  isActive,
  onSelect,
  cycleNonce,
  showProgress,
}: {
  topic: Topic;
  isActive: boolean;
  onSelect: () => void;
  cycleNonce: number;
  showProgress: boolean;
}) {
  const ease = "motion-safe:transition-colors motion-safe:duration-300 motion-safe:ease-v1-out";

  // Grid rows [auto / 1fr] (title / body) keep every card the same
  // height regardless of how many body lines each topic has.
  return (
    <button
      type="button"
      aria-current={isActive ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "group/topic relative grid h-full w-full cursor-pointer grid-rows-[auto_1fr] gap-3 rounded-md px-2 py-6 text-left",
        ease,
        "hover:bg-v1-frost/[0.035] focus-visible:bg-v1-frost/[0.04] focus-visible:outline-none",
      )}
    >
      <div className="flex w-full items-start gap-2 md:items-center">
        <span
          aria-hidden="true"
          className="flex h-[32px] w-[24px] shrink-0 items-center justify-center md:h-auto"
        >
          <span
            className={cn(
              "size-2 motion-safe:transition-[background-color,transform] motion-safe:duration-300 motion-safe:ease-v1-out",
              isActive
                ? "bg-v1-accent-salmon motion-safe:animate-pulse"
                : "bg-v1-steel group-hover/topic:translate-x-[2px] group-hover/topic:bg-v1-frost",
            )}
          />
        </span>
        <span
          className={cn(
            "font-v1Heading text-[24px] leading-[32px] tracking-[-0.01em] md:whitespace-nowrap md:text-[length:clamp(1.125rem,1.85vw,1.625rem)] md:leading-[1.2]",
            ease,
            isActive ? "text-v1-frost" : "text-v1-frost/70 group-hover/topic:text-v1-frost",
          )}
        >
          {topic.title}
        </span>
      </div>
      <p
        className={cn(
          "pl-8 font-v1Body text-[16px] leading-[1.5] tracking-[-0.01em] md:text-[length:clamp(0.8rem,1.15vw,1rem)] md:tracking-normal",
          ease,
          isActive ? "text-[#a9b6cf]" : "text-v1-frost/70 group-hover/topic:text-v1-frost/90",
        )}
      >
        {topic.body}
      </p>

      {/* Active-topic progress bar — keyed by nonce so the fill
          replays at each cycle tick. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 top-0 block h-[2px] overflow-hidden bg-v1-frost/[0.08]"
        style={{ opacity: isActive && showProgress ? 1 : 0 }}
      >
        {isActive && showProgress && (
          <span
            key={`progress-${topic.id}-${cycleNonce}`}
            className="v1-trusted-progress block h-full w-full bg-v1-accent-salmon"
            style={{ ["--cycle-ms" as string]: `${CYCLE_MS}ms` }}
          />
        )}
      </span>
    </button>
  );
}

const EXPLORER = "https://node-console.portaldot.dev/#/explorer/query";

interface ChainFact {
  title: string;
  body: ReactNode;
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} underline target="_blank" rel="noreferrer">
      {children}
    </Link>
  );
}

const CHAIN_FACTS: ChainFact[] = [
  {
    title: "PotluckRegistry (EVM)",
    body: (
      <>
        <span className="font-v1Mono">0xef93…82eb</span> on Portaldot V3, deployed at block{" "}
        <Ext href={`${EXPLORER}/129014`}>#129,014</Ext>.
      </>
    ),
  },
  {
    title: "Deploy transaction",
    body: (
      <>
        <span className="font-v1Mono">0x3abb…0352</span>, storage deposit 433.2 tPOT.{" "}
        <Ext href={`${EXPLORER}/129014`}>Open in explorer</Ext>.
      </>
    ),
  },
  {
    title: "Manifest #2",
    body: (
      <>
        Portaldot V3 history, blocks #1–#129,069, registered at block{" "}
        <Ext href={`${EXPLORER}/129095`}>#129,095</Ext>.
      </>
    ),
  },
  {
    title: "Manifest #3",
    body: (
      <>
        Polkadot AH, 80,000 blocks and 114,460 rows for 372.64 tPOT, registered at block{" "}
        <Ext href={`${EXPLORER}/129233`}>#129,233</Ext>.
      </>
    ),
  },
  {
    title: "Tested contracts",
    body: (
      <>
        21 Foundry tests, 100% coverage; EVM and PVM bytecode pass{" "}
        <span className="font-v1Mono">ReviveApi</span> dry runs.{" "}
        <Ext href={`${REPO_URL}/tree/main/contracts`}>Source</Ext>.
      </>
    ),
  },
  {
    title: "Public on GitHub",
    body: (
      <>
        Spec, core, client, CLI and both apps in one repo.{" "}
        <Ext href={REPO_URL}>wngstnr-code/potluck</Ext>.
      </>
    ),
  },
];

function CisoBlock() {
  return (
    <div className="flex flex-col gap-[62px] lg:pb-16">
      <div className="flex flex-col gap-6">
        {/* Secondary card title — display-xs (40px) at lg for a smaller
            hierarchy below the section h2. */}
        <h2 className="max-w-[290px] font-v1Display text-[24px] leading-[1.25] tracking-[-0.03em] text-v1-frost lg:text-v1-display-xs lg:max-w-none lg:text-balance">
          On-chain. Check it yourself.
        </h2>
        {/* !tracking-normal overrides the token's baked-in -0.01em. */}
        <p className="text-v1-body-lg !tracking-normal text-v1-frost">
          Every address and block below is on the Portaldot V3 testnet.
        </p>
      </div>

      <CisoGrid />
    </div>
  );
}

function CisoGrid() {
  return (
    <ul
      className="
        grid grid-cols-1 gap-x-8 gap-y-6
        sm:grid-cols-2 sm:gap-y-[58px]
        lg:grid-cols-3
      "
    >
      {CHAIN_FACTS.map((feature, i) => (
        <motion.li key={feature.title} {...reveals.item(i)} className="flex flex-col gap-4">
          <h3 className="text-v1-heading-xs-loose text-v1-frost lg:text-v1-heading-sm">
            {feature.title}
          </h3>
          <p className="text-v1-body-sm text-pretty !tracking-normal text-v1-frost">
            {feature.body}
          </p>
        </motion.li>
      ))}
    </ul>
  );
}

function VisualizationCard({ children }: { children: ReactNode }) {
  return (
    <GradientFrame
      variant="charcoal"
      className="w-full rounded-[9.026px]"
      innerClassName="
        relative flex w-full min-h-[220px] items-center justify-center
        px-4 py-6
        lg:h-[645px] lg:px-[36px] lg:py-12
      "
    >
      {children}
    </GradientFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Visualizations. Every number below comes from the local builds and the
// published manifests (builds/polkadot-ah.balance-history/*, manifests #2
// and #3), not from a mock-up.
// ─────────────────────────────────────────────────────────────────────

const GREEN = "#78d6a8";
const MUTED = "#8092b2";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Accounts reconciled per chunk of the 1.5 M-block Polkadot AH build
// (#20,572,285–#22,072,284); every one matched System.Account (L3).
const CHUNK_ACCOUNTS = [
  19716, 20351, 21844, 21081, 20973, 19591, 18138, 21731, 20649, 21412, 20930, 19415, 20755, 21870,
  21892, 20653, 20508, 20029, 20778, 20111, 21527, 21325, 18906, 18524, 22017, 20481, 20132, 19707,
  20481, 21663,
];

const BARS_W = 1100;
const BARS_H = 500;
const BARS_PAD = { l: 64, r: 16, t: 84, b: 48 };
const BARS_MAX = 24000;

function ChunkBars() {
  const plotW = BARS_W - BARS_PAD.l - BARS_PAD.r;
  const plotH = BARS_H - BARS_PAD.t - BARS_PAD.b;
  const slot = plotW / CHUNK_ACCOUNTS.length;
  const barW = slot * 0.62;
  const total = CHUNK_ACCOUNTS.reduce((a, b) => a + b, 0);
  return (
    <svg
      viewBox={`0 0 ${BARS_W} ${BARS_H}`}
      className="h-auto w-full max-w-[1100px]"
      role="img"
      aria-label={`Accounts reconciled per chunk: 30 of 30 chunks, ${total.toLocaleString("en-US")} account checks, all matching the chain`}
    >
      <text x={BARS_PAD.l} y={22} fill="#f3f6fb" fontFamily={MONO} fontSize="16">
        accounts reconciled per chunk · polkadot-ah · #20,572,285–#22,072,284
      </text>
      <text x={BARS_PAD.l} y={48} fill={GREEN} fontFamily={MONO} fontSize="16">
        30 / 30 chunks · {total.toLocaleString("en-US")} checks · 0 off
      </text>
      {[0, 6000, 12000, 18000, 24000].map((v) => {
        const y = BARS_PAD.t + plotH - (v / BARS_MAX) * plotH;
        return (
          <g key={v}>
            <line x1={BARS_PAD.l} x2={BARS_W - BARS_PAD.r} y1={y} y2={y} stroke="#1e3058" />
            <text
              x={BARS_PAD.l - 10}
              y={y + 4}
              fill={MUTED}
              fontFamily={MONO}
              fontSize="12"
              textAnchor="end"
            >
              {v / 1000}k
            </text>
          </g>
        );
      })}
      {CHUNK_ACCOUNTS.map((v, i) => {
        const h = (v / BARS_MAX) * plotH;
        const x = BARS_PAD.l + i * slot + (slot - barW) / 2;
        const y = BARS_PAD.t + plotH - h;
        return (
          <motion.rect
            // biome-ignore lint/suspicious/noArrayIndexKey: one bar per chunk index
            key={i}
            x={x}
            width={barW}
            rx={2}
            fill={GREEN}
            fillOpacity={0.85}
            initial={{ y: BARS_PAD.t + plotH, height: 0 }}
            animate={{ y, height: h }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.045, ease: [0.2, 0.8, 0.2, 1] }}
          />
        );
      })}
      {[0, 9, 19, 29].map((i) => (
        <text
          key={i}
          x={BARS_PAD.l + i * slot + slot / 2}
          y={BARS_H - 18}
          fill={MUTED}
          fontFamily={MONO}
          fontSize="12"
          textAnchor="middle"
        >
          chunk {i}
        </text>
      ))}
    </svg>
  );
}

// The first rows of block #22,021,137 in chunk 0 of manifest #3, as stored.
const SAMPLE_ROWS = [
  '{"block":22021137,"eventIndex":2,"kind":"Withdraw","from":"0x52a0e8773084de2472096d45807d18f172d53008c49ca9055ecb9621eec6b61e","to":null,"amount":"8808355"}',
  '{"block":22021137,"eventIndex":3,"kind":"Transfer","from":"0x52a0e8773084de2472096d45807d18f172d53008c49ca9055ecb9621eec6b61e","to":"0x3499d6fbebb2405b4b0c5651850dbfd7c005c8b4b5e37c0563caa2f8b4cca6bc","amount":"10000000"}',
  '{"block":22021137,"eventIndex":4,"kind":"Deposit","from":null,"to":"0x6d6f646c6461702f627566661c73746167696e67000000000000000000000000","amount":"8808355"}',
  '{"block":22021137,"eventIndex":9,"kind":"KilledAccount","from":null,"to":"0x52a0e8773084de2472096d45807d18f172d53008c49ca9055ecb9621eec6b61e","amount":"0","effect":"reset"}',
  '{"block":22021137,"eventIndex":10,"kind":"Transfer","from":"0x52a0e8773084de2472096d45807d18f172d53008c49ca9055ecb9621eec6b61e","to":"0x967cccc1ff3d1f37b9e6c8a39d8ba72ad85d35e19cc0717a72f1a21037606144","amount":"172521563"}',
];
const CHUNK0_RAW_HASH = "0xb826c80cbdda09f5a965dd37e28d18e484339f320bc28b7565e128f3e92cd780";

function CanonicalRows() {
  return (
    <div className="flex w-full max-w-[1100px] flex-col gap-6 font-v1Mono text-[12px] leading-[20px] lg:text-[13px] lg:leading-[22px]">
      <p className="text-v1-frost/60">
        chunk 0 · manifest #3 · 85,578 rows · ndjson, keys in spec column order
      </p>
      <div className="flex flex-col gap-1 overflow-hidden">
        {SAMPLE_ROWS.map((row, i) => (
          <motion.div
            key={row}
            className="truncate text-v1-frost/85"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.2 + i * 0.25 }}
          >
            {row}
          </motion.div>
        ))}
        <motion.div
          className="text-v1-frost/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + SAMPLE_ROWS.length * 0.25 }}
        >
          … 85,573 more rows
        </motion.div>
      </div>
      <motion.div
        className="flex flex-col gap-1 border-t border-v1-frost/10 pt-5"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 + SAMPLE_ROWS.length * 0.25 }}
      >
        <span className="text-v1-frost/60">rawHash = blake2b-256(ndjson)</span>
        <span className="break-all" style={{ color: GREEN }}>
          {CHUNK0_RAW_HASH}
        </span>
        <span className="text-v1-frost/60">
          same spec + same finalized blocks → same hash, on any machine
        </span>
      </motion.div>
    </div>
  );
}

interface CoverageSegment {
  /** Fraction of the chain's track, 0–1. */
  from: number;
  to: number;
  label: string;
  tone: "published" | "verified" | "direct";
}

interface CoverageRow {
  chain: string;
  range: string;
  segments: CoverageSegment[];
}

// Track ends are the chain heights measured on 2026-10-27; the live
// tail keeps following the head after that.
const PD_HEAD = 215396;
const pd = (b: number) => b / PD_HEAD;
// Polkadot AH's track spans the Revive window up to the end of manifest #3.
const AH_START = 11405259;
const AH_END = 22101127;
const ah = (b: number) => (b - AH_START) / (AH_END - AH_START);

const COVERAGE: CoverageRow[] = [
  {
    chain: "Portaldot V3",
    range: "#1 → #215,396 (27 Oct) → live",
    segments: [
      { from: 0, to: pd(129069), label: "manifest #2 · #1–#129,069", tone: "published" },
      { from: pd(129069), to: 1, label: "direct sync + live tail", tone: "direct" },
    ],
  },
  {
    chain: "Polkadot Asset Hub",
    range: "#11,405,259 → #22,101,127 → live",
    segments: [
      { from: 0, to: ah(20572285), label: "direct sync / older backfill", tone: "direct" },
      {
        from: ah(20572285),
        to: ah(22021128),
        label: "1.5 M blocks verified, awaiting tPOT",
        tone: "verified",
      },
      { from: ah(22021128), to: 1, label: "manifest #3 (80,000 blocks)", tone: "published" },
    ],
  },
];

const TONE_STYLE: Record<CoverageSegment["tone"], CSSProperties> = {
  published: { background: GREEN },
  verified: {
    background: `repeating-linear-gradient(135deg, ${GREEN}55 0 6px, transparent 6px 12px)`,
    boxShadow: `inset 0 0 0 1px ${GREEN}88`,
  },
  direct: { background: "rgba(232,234,237,0.12)" },
};

function CoverageTimeline() {
  return (
    <div className="flex w-full max-w-[1100px] flex-col gap-10 font-v1Mono text-[12px] lg:text-[13px]">
      {COVERAGE.map((row, r) => (
        <div key={row.chain} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-v1-frost">{row.chain}</span>
            <span className="text-v1-frost/60">{row.range}</span>
          </div>
          <div className="relative h-9 w-full overflow-hidden rounded-[4px] bg-v1-frost/[0.04]">
            {row.segments.map((seg, i) => (
              <motion.div
                key={seg.label}
                className="absolute inset-y-0 origin-left"
                style={{
                  left: `${seg.from * 100}%`,
                  width: `${(seg.to - seg.from) * 100}%`,
                  ...TONE_STYLE[seg.tone],
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: 0.6,
                  delay: 0.2 + r * 0.4 + i * 0.2,
                  ease: [0.2, 0.8, 0.2, 1],
                }}
              />
            ))}
          </div>
          {/* First segment labelled on the left, the rest joined on the
              right: narrow segments are too thin to carry their own label. */}
          <div className="flex justify-between gap-4 text-v1-frost/60">
            <span>{row.segments[0]?.label}</span>
            <span className="text-right">
              {row.segments
                .slice(1)
                .map((seg) => seg.label)
                .join(" · ")}
            </span>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-v1-frost/60">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-[2px]" style={TONE_STYLE.published} /> published on
          Portaldot
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-[2px]" style={TONE_STYLE.verified} /> built + verified
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-[2px]" style={TONE_STYLE.direct} /> direct sync in the
          browser
        </span>
      </div>
    </div>
  );
}
