"use client";

import { motion } from "motion/react";
import { StackAfter, StackBefore } from "@/components/v1/sections/Home/StackDiagrams";
import BeforeAfterSlider from "@/components/v1/sections/shared/BeforeAfterSlider";
import { ParaReveal } from "@/components/v1/sections/shared/ParaReveal";
import Section from "@/components/v1/sections/shared/Section";
import { HOME_SECTION_TITLE } from "@/components/v1/sections/shared/sectionTitle";
import { reveals } from "@/utils/v1/reveals";

export default function ItDoesntHaveToBeHard() {
  return (
    <Section
      aria-label="It doesn't have to be a stack"
      className="relative"
      containerClassName="
        grid grid-cols-1 gap-[29px]
        lg:grid-cols-[362fr_912fr] lg:items-stretch lg:gap-[102px]
      "
    >
      <Copy />
      <BeforeAfterSlider
        ariaLabel="Drag to compare the before and after states"
        before={
          <div
            role="img"
            aria-label="Before: an archive node, an indexer service, Postgres, a GraphQL API and hosting to run, with cron jobs, reorgs and on-call, and users asked to trust it."
            className="absolute inset-0"
          >
            <StackBefore />
          </div>
        }
        after={
          <div
            role="img"
            aria-label="After: a spec built once, stored on Portaldot in TransactionStorage with a PotluckRegistry manifest, fetched over bitswap by the user's browser and checked with L1, L2 and L3."
            className="absolute inset-0"
          >
            <StackAfter />
          </div>
        }
        beforeOverlay={
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0) 100%)",
            }}
          />
        }
        afterOverlay={
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 80% 30%, rgba(255, 240, 230, 0.14), rgba(255, 240, 230, 0) 70%)",
            }}
          />
        }
      />
    </Section>
  );
}

function Copy() {
  return (
    <div className="flex flex-col gap-v1-stack lg:pt-16">
      <motion.h2
        {...reveals.heading}
        aria-label="It doesn't have to be a stack"
        className={HOME_SECTION_TITLE}
      >
        <span aria-hidden="true" className="block lg:hidden">
          It doesn&rsquo;t have to be
        </span>
        <span aria-hidden="true" className="hidden lg:block">
          It doesn&rsquo;t
        </span>
        <span aria-hidden="true" className="hidden lg:block">
          have to be
        </span>
        <span aria-hidden="true" className="block">
          a stack.
        </span>
      </motion.h2>
      {/* Body stays bespoke: it shrinks 18→14px at lg via the clamp so
          the two locked, no-wrap lines fit the narrow 362fr column —
          no body token expresses that column-fit responsive scale. */}
      <ParaReveal>
        <p className="font-v1Body text-[18px] leading-[28px] tracking-[-0.01em] text-[#a9b6cf] lg:text-[clamp(0.875rem,1.4vw,1.125rem)] lg:leading-[1.5]">
          <span className="lg:block lg:whitespace-nowrap">
            History that ships as a spec and a few blobs,{" "}
          </span>
          <span className="lg:block lg:whitespace-nowrap">not as an indexer you run forever.</span>
        </p>
      </ParaReveal>
    </div>
  );
}
