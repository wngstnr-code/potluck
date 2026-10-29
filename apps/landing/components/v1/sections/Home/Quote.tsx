"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import GradientFrame from "@/components/v1/sections/shared/GradientFrame";
import Section from "@/components/v1/sections/shared/Section";
import { HOME_SECTION_TITLE } from "@/components/v1/sections/shared/sectionTitle";
import { withBase } from "@/utils/basePath";
import { cn } from "@/utils/v1/cn";
import { reveals } from "@/utils/v1/reveals";

// The 1-minute Potluck ad (potluck-ad-v2), re-encoded for the web with
// faststart so it streams before it finishes downloading. The source
// lives in promo/out/.
const DEMO_VIDEO = withBase("/assets/home/potluck-ad.mp4");
const DEMO_POSTER = withBase("/assets/home/potluck-ad-poster.jpg");

/**
 * Product demo — the first section after the hero, and the one
 * centre-aligned lockup on the page: title → body, stacked on the centre
 * axis above the demo video in the gradient-ring frame. The video plays
 * while at least half of it is on screen and pauses when it leaves.
 *
 * `z-10` lifts the frame above the next section's blue slab, which
 * reaches up into this section's bottom padding so the frame appears
 * to rest on it.
 */
export default function Quote() {
  return (
    <Section
      aria-labelledby="home-dx-heading"
      className="relative z-10"
      containerClassName="flex flex-col items-center gap-16"
    >
      <div className="flex w-full flex-col items-center gap-6 text-center">
        <motion.h2
          {...reveals.heading}
          id="home-dx-heading"
          className={cn(HOME_SECTION_TITLE, "max-w-[900px]")}
        >
          See history verify itself
        </motion.h2>
        <motion.p {...reveals.body} className="text-v1-body-lg-loose max-w-[600px]">
          Pantry loads Polkadot Asset Hub from Portaldot in seconds, not the ~11 minutes a direct
          sync takes, and reconciles every account against the chain. Forge one row and it names the
          exact amount.
        </motion.p>
      </div>

      <motion.div {...reveals.body} className="w-full">
        <GradientFrame
          variant="black"
          className="rounded-[10px]"
          innerClassName="relative aspect-video"
        >
          <DemoVideo />
        </GradientFrame>
      </motion.div>
    </Section>
  );
}

/**
 * Plays while at least half of the frame is visible and pauses once it
 * scrolls away. Browsers only allow autoplay when muted, so it starts
 * muted; if the viewer turns the sound on, later plays keep it on.
 * Reduced motion: no autoplay, the viewer starts it with the controls.
 */
function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={DEMO_VIDEO}
      poster={DEMO_POSTER}
      controls
      muted
      playsInline
      preload="metadata"
      className="absolute inset-0 block h-full w-full bg-black object-cover"
      aria-label="Potluck video, 1 minute"
    />
  );
}
