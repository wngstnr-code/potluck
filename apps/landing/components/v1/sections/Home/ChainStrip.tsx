/**
 * Source-chain strip — sits directly below the Hero, anchored at the fold.
 *
 * Auto-scrolling marquee of the chains Potluck publishes histories from,
 * each shown as its logo plus name. Logos: Polkadot / Kusama Asset Hub
 * from polkadot-js/apps (Apache-2.0), Portaldot from portaldot.io.
 *
 * Three chains are narrower than the window, so each marquee copy repeats
 * the list (REPEAT) until one copy is wider than the visible strip; the
 * track holds two identical copies so `translateX(-50%)` loops without a
 * jump. Animation is gated by `motion-safe:` so it pauses for users with
 * `prefers-reduced-motion: reduce`.
 */

import Image from "next/image";
import { withBase } from "@/utils/basePath";

interface SourceChain {
  name: string;
  logo: string;
}

const CHAINS: SourceChain[] = [
  { name: "Polkadot Asset Hub", logo: withBase("/assets/chains/assethub-polkadot.svg") },
  { name: "Kusama Asset Hub", logo: withBase("/assets/chains/assethub-kusama.svg") },
  { name: "Portaldot V3", logo: withBase("/assets/chains/portaldot.png") },
];

const REPEAT = 4;
const TRACK = Array.from({ length: REPEAT }, () => CHAINS).flat();

export default function ChainStrip() {
  // Soft 120px fade at both horizontal edges so items drift in/out of view.
  const edgeMask =
    "linear-gradient(to right, transparent 0, black 120px, black calc(100% - 120px), transparent 100%)";

  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 sm:px-9 lg:px-8">
      <div className="border-t border-v1-frost/[0.08] pt-6 lg:pt-8">
        <p className="text-v1-label-sm uppercase text-v1-frost/60">Sourcing history from</p>
        <section
          aria-label="Source chains"
          className="relative overflow-hidden py-8 lg:flex lg:h-[110px] lg:items-center lg:py-0"
          style={{ maskImage: edgeMask, WebkitMaskImage: edgeMask }}
        >
          <div className="flex w-max items-center motion-safe:animate-[v1-logo-marquee_40s_linear_infinite]">
            {[0, 1].map((copy) => (
              <ul
                key={copy}
                aria-hidden={copy === 1 ? true : undefined}
                className="flex shrink-0 items-center gap-x-10 pr-10 lg:gap-x-20 lg:pr-20"
              >
                {TRACK.map((chain, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: the list repeats each chain, so the slot is the identity
                    key={`${chain.name}-${copy}-${i}`}
                    // Only the first listing of each chain is announced.
                    aria-hidden={copy === 1 || i >= CHAINS.length ? true : undefined}
                    className="flex shrink-0 items-center gap-3"
                  >
                    <Image
                      src={chain.logo}
                      alt=""
                      width={28}
                      height={28}
                      className="size-6 rounded-full lg:size-7"
                    />
                    <span className="whitespace-nowrap text-v1-body-md text-v1-frost">
                      {chain.name}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
