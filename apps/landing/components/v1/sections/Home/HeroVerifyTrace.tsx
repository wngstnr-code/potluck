"use client";

import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/utils/v1/cn";

/**
 * Hero visual: the log of a browser loading a published Potluck history,
 * with each verification stage lighting up in order as it runs.
 *
 * The figures are the real ones for chunk 0 of manifest #3 (Polkadot Asset
 * Hub balance history, blocks #22,021,128–#22,071,133): a 2.5 MB blob,
 * 85,578 rows, 21,384 / 21,384 accounts reconciled. The one failure beat is
 * the bitswap fetch dropping and retrying, which is what the public
 * Portaldot node really does (it drops sockets about once a minute and the
 * client reconnects).
 *
 * Each stage sits in a block that lights up editor-style (row wash + left
 * bar) with a status pill in the left gutter on desktop, inline on small
 * screens. Reduced motion: no timeline; every stage shows as completed.
 */

type StepState = "idle" | "running" | "retrying" | "done";
type Steps = [StepState, StepState, StepState, StepState];

interface Frame {
  at: number;
  steps: Steps;
}

// One pass of the trace; `at` is ms from the start of the loop.
const TIMELINE: Frame[] = [
  { at: 0, steps: ["running", "idle", "idle", "idle"] },
  { at: 900, steps: ["done", "idle", "idle", "idle"] },
  { at: 1300, steps: ["done", "running", "idle", "idle"] },
  { at: 2400, steps: ["done", "retrying", "idle", "idle"] },
  { at: 3500, steps: ["done", "running", "idle", "idle"] },
  { at: 4500, steps: ["done", "done", "idle", "idle"] },
  { at: 4900, steps: ["done", "done", "running", "idle"] },
  { at: 5900, steps: ["done", "done", "done", "idle"] },
  { at: 6300, steps: ["done", "done", "done", "running"] },
  { at: 7600, steps: ["done", "done", "done", "done"] },
];
// ~2s hold on the finished load, then the loop restarts.
const LOOP_MS = 9800;
const ENTRY_DELAY_MS = 900;

const DONE_NOTES = [
  "Done | manifest #3",
  "Done | 2.5 MB",
  "Done | 85,578 rows",
  "Done | 21,384 / 21,384",
];
const RUNNING_NOTE = "Running";
const RETRY_NOTE = "Dropped | retry 1/3";

const IDLE: Steps = ["idle", "idle", "idle", "idle"];
const DONE: Steps = ["done", "done", "done", "done"];

const GREY = "#a9b6cf";
const GREEN = "#78d6a8";
const BLUE = "#7fa8f0";

function Value({ children }: { children: ReactNode }) {
  return <span style={{ color: BLUE }}>{children}</span>;
}

/** The stage name, styled like the original's `step.run` keyword. */
function Stage({ state, name }: { state: StepState; name: string }) {
  return (
    <span className={cn("hero-step-run", `hero-step-run--${state}`)}>
      <span className="hero-step-dot">▸ </span>
      <span className="hero-step-name">{name}</span>
    </span>
  );
}

function StatusPill({ state, index }: { state: StepState; index: number }) {
  const text =
    state === "done"
      ? DONE_NOTES[index]
      : state === "retrying"
        ? RETRY_NOTE
        : state === "running"
          ? RUNNING_NOTE
          : " ";
  return (
    <span aria-hidden="true" className={cn("hero-step-pill", `hero-step-pill--${state}`)}>
      {state === "running" && <span className="hero-step-pill-dot" />}
      {text}
    </span>
  );
}

function StepBlock({ state, children }: { state: StepState; children: ReactNode }) {
  return <span className={cn("hero-step-block", `hero-step-block--${state}`)}>{children}</span>;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HeroVerifyTrace() {
  const [reduced, setReduced] = useState(false);
  const [entered, setEntered] = useState(false);
  const [steps, setSteps] = useState<Steps>(IDLE);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  // Blur-in entrance, then start the trace once the log is legible.
  useEffect(() => {
    if (reduced) {
      setEntered(true);
      setSteps(DONE);
      return;
    }
    const id = window.setTimeout(() => setEntered(true), 40);
    return () => window.clearTimeout(id);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const timers: number[] = [];
    let loopStart = 0;

    const schedule = () => {
      for (const frame of TIMELINE) {
        timers.push(window.setTimeout(() => setSteps(frame.steps), loopStart + frame.at));
      }
      timers.push(window.setTimeout(() => setSteps(IDLE), loopStart + LOOP_MS - 400));
      timers.push(
        window.setTimeout(() => {
          timers.length = 0;
          loopStart = 0;
          schedule();
        }, loopStart + LOOP_MS),
      );
    };

    loopStart = ENTRY_DELAY_MS;
    schedule();
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [reduced]);

  const [s1, s2, s3, s4] = steps;

  return (
    <figure
      className="hero-code-trace m-0 w-full max-w-[588px] shrink-0 lg:max-w-[640px] lg:flex-none"
      aria-label="A browser loading a Potluck history from Portaldot and verifying it in four stages"
    >
      {/* lg: 176px left gutter reserved for the status pills. */}
      <pre
        className={cn(
          "hero-code-pre m-0 overflow-x-auto whitespace-pre font-v1Mono text-[13px] leading-[20px] [-ms-overflow-style:none] [scrollbar-width:none] lg:overflow-visible lg:pl-[176px] [&::-webkit-scrollbar]:hidden",
          entered && "hero-code-pre--in",
        )}
        style={{ color: GREY }}
      >
        <code className="block">
          {"// open "}
          <span style={{ color: GREEN }}>polkadot-ah.balance-history</span>
          {"\n"}
          {"// in the browser, no server\n"}
          {"\n"}
          <StepBlock state={s1}>
            <Stage state={s1} name="registry" />
            {"\n"}
            {"  latest manifest from PotluckRegistry\n"}
            {"  on "}
            <Value>Portaldot V3</Value>
            {" (pallet-revive)"}
            <StatusPill state={s1} index={0} />
          </StepBlock>
          <StepBlock state={s2}>
            <Stage state={s2} name="fetch" />
            {"\n"}
            {"  chunk 0 via "}
            <Value>bitswap_v1_get</Value>
            {"\n"}
            {"  blocks #22,021,128 – #22,071,133"}
            <StatusPill state={s2} index={1} />
          </StepBlock>
          <StepBlock state={s3}>
            <Stage state={s3} name="L1 integrity" />
            {"\n"}
            {"  rawHash "}
            <Value>0xb826c80c…</Value>
            {" matches the manifest\n"}
            {"  canonical rows, bloom checked"}
            <StatusPill state={s3} index={2} />
          </StepBlock>
          <StepBlock state={s4}>
            <Stage state={s4} name="L3 reconcile" />
            {"\n"}
            {"  every balance delta against "}
            <Value>System.Account</Value>
            {"\n"}
            {"  on Polkadot Asset Hub itself"}
            <StatusPill state={s4} index={3} />
          </StepBlock>
        </code>
      </pre>
    </figure>
  );
}
