"use client";

import { useEffect, useState } from "react";
import { cn } from "@/utils/v1/cn";

/**
 * Animated code/terminal panel for one capability row. While `play` is
 * true the lines type in one after another and each status note lands as
 * its line appears; when it turns false the panel holds its finished
 * state. Reduced motion: every line shows at once.
 *
 * Every figure in the panels is a measured one (docs/DEVELOPMENT.md §1),
 * so the panels are a compact log of what Potluck really did.
 */

export type TraceTone = "ok" | "fail" | "info";

export interface TraceLine {
  /** The code or log text. Empty string renders a blank spacer line. */
  text: string;
  /** Right-hand status note, coloured by `tone`. */
  note?: string;
  tone?: TraceTone;
  /** Grey comment line. */
  comment?: boolean;
}

const STEP_MS = 320;
const START_MS = 250;

const TONE_CLASS: Record<TraceTone, string> = {
  ok: "text-[#78d6a8]",
  fail: "text-[#ff7b6b]",
  info: "text-[#7fa8f0]",
};

export default function CapabilityTrace({
  title,
  lines,
  play,
}: {
  title: string;
  lines: TraceLine[];
  play: boolean;
}) {
  const [shown, setShown] = useState(lines.length);

  useEffect(() => {
    if (!play) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(lines.length);
      return;
    }
    setShown(0);
    const timers = lines.map((_, i) =>
      window.setTimeout(() => setShown(i + 1), START_MS + i * STEP_MS),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [play, lines]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center gap-2 border-b border-v1-frost/[0.08] px-4 py-3">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-v1-frost/15" />
        <span aria-hidden="true" className="size-2.5 rounded-full bg-v1-frost/15" />
        <span aria-hidden="true" className="size-2.5 rounded-full bg-v1-frost/15" />
        <span className="ml-2 font-v1Mono text-[12px] text-v1-frost/60">{title}</span>
      </div>
      <pre className="m-0 flex-1 overflow-hidden px-5 py-4 font-v1Mono text-[12px] leading-[20px] text-[#a9b6cf] sm:text-[13px] sm:leading-[22px]">
        <code className="block">
          {lines.map((line, i) => {
            const visible = i < shown;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list that never reorders; lines can repeat
                key={i}
                className={cn(
                  "flex min-h-[20px] items-baseline justify-between gap-4 sm:min-h-[22px]",
                  "motion-safe:transition-[opacity,filter,transform] motion-safe:duration-300 motion-safe:ease-v1-out",
                  visible ? "opacity-100 blur-0" : "translate-y-1 opacity-0 blur-[2px]",
                  line.tone === "fail" &&
                    visible &&
                    "motion-safe:animate-[hero-step-shake_420ms_1]",
                )}
              >
                <span
                  className={cn(
                    "whitespace-pre",
                    line.comment ? "text-v1-frost/60" : "text-v1-frost/85",
                  )}
                >
                  {line.text || " "}
                </span>
                {line.note && (
                  <span
                    className={cn("shrink-0 whitespace-nowrap", TONE_CLASS[line.tone ?? "info"])}
                  >
                    {line.note}
                  </span>
                )}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
