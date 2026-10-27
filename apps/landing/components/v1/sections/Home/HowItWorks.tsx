"use client";

import { useEffect, useRef, useState } from "react";
import Section from "@/components/v1/sections/shared/Section";
import SectionHeader from "@/components/v1/sections/shared/SectionHeader";
import { HOME_SECTION_TITLE } from "@/components/v1/sections/shared/sectionTitle";
import { cn } from "@/utils/v1/cn";

/**
 * "How it works" — the four steps from a spec to a verified history in
 * the browser. When the section scrolls into view a line runs across the
 * steps and each step lights up as the line reaches it (top to bottom
 * below md). The header's "How it works" link targets this section.
 * Reduced motion: every step shows lit, no run.
 */

interface Step {
  title: string;
  body: string;
  /** The real command or app that performs the step. */
  tool: string;
}

const STEPS: Step[] = [
  {
    title: "Describe",
    body: "A JSON spec names the events to index, the row each one becomes, and how rows reconcile with chain state.",
    tool: "specs/*.json",
  },
  {
    title: "Build",
    body: "The publisher reads finalized blocks, decodes each with the runtime that executed it, and writes canonical NDJSON chunks.",
    tool: "potluck build · potluck verify",
  },
  {
    title: "Publish",
    body: "Chunks go into Portaldot’s TransactionStorage and the manifest into the PotluckRegistry contract, in one batch.",
    tool: "potluck publish",
  },
  {
    title: "Load & verify",
    body: "Any browser reads the registry, fetches chunks over bitswap, checks L1 · L2 · L3 against the source chain, then tails new blocks.",
    tool: "@potluck/client · Pantry",
  },
];

// Time for the line to cross one step, and the pause before it starts.
const STEP_MS = 650;
const START_MS = 300;

export default function HowItWorks() {
  const ref = useRef<HTMLOListElement>(null);
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLit(STEPS.length);
      return;
    }
    const timers: number[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        for (let i = 0; i < STEPS.length; i++) {
          timers.push(window.setTimeout(() => setLit(i + 1), START_MS + i * STEP_MS));
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  // Fraction of the rail filled: up to the centre of the last lit step.
  const progress = lit === 0 ? 0 : (lit - 0.5) / STEPS.length;

  return (
    <Section id="how-it-works" aria-labelledby="home-how-heading" className="relative scroll-mt-16">
      <SectionHeader
        id="home-how-heading"
        title="How it works"
        titleClassName={HOME_SECTION_TITLE}
        body="Four steps from a spec to a history every user can check for themselves."
        bodyClassName="max-w-[560px]"
      />

      <ol
        ref={ref}
        className="relative mt-v1-stack grid list-none gap-10 pl-0 md:grid-cols-4 md:gap-8"
      >
        {/* Rail: horizontal across the numbers at md+, vertical on the left below. */}
        <span
          aria-hidden="true"
          className="absolute left-[19px] top-5 h-[calc(100%-40px)] w-px bg-v1-frost/[0.12] md:left-5 md:right-5 md:top-5 md:h-px md:w-auto"
        />
        <span
          aria-hidden="true"
          className="absolute left-[19px] top-5 w-px origin-top bg-v1-accent-salmon motion-safe:transition-[height,width] motion-safe:duration-[650ms] motion-safe:ease-linear md:hidden"
          style={{ height: `calc((100% - 40px) * ${progress})` }}
        />
        <span
          aria-hidden="true"
          className="absolute left-5 top-5 hidden h-px bg-v1-accent-salmon motion-safe:transition-[width] motion-safe:duration-[650ms] motion-safe:ease-linear md:block"
          style={{ width: `calc((100% - 40px) * ${progress})` }}
        />

        {STEPS.map((step, i) => {
          const on = i < lit;
          return (
            <li key={step.title} className="relative flex gap-5 md:flex-col md:gap-6">
              <span
                className={cn(
                  "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border font-v1Mono text-[13px]",
                  "motion-safe:transition-colors motion-safe:duration-500",
                  on
                    ? "border-v1-accent-salmon bg-v1-accent-salmon text-v1-jetBlack"
                    : "border-v1-frost/20 bg-v1-canvasBase text-v1-frost/60",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div
                className={cn(
                  "flex flex-col gap-3 motion-safe:transition-opacity motion-safe:duration-500",
                  on ? "opacity-100" : "opacity-40",
                )}
              >
                <h3 className="text-v1-heading-sm text-v1-frost">{step.title}</h3>
                <p className="text-v1-body-sm">{step.body}</p>
                <code className="w-fit rounded-[4px] bg-v1-frost/[0.06] px-2 py-1 font-v1Mono text-[12px] text-v1-frost/80">
                  {step.tool}
                </code>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
