import PageShell from "@/components/v1/PageShell";
import Capabilities from "@/components/v1/sections/Home/CapabilityRows";
import Hero from "@/components/v1/sections/Home/Hero";
import HowItWorks from "@/components/v1/sections/Home/HowItWorks";
import ItDoesntHaveToBeHard from "@/components/v1/sections/Home/ItDoesntHaveToBeHard";
import LogoMarquee from "@/components/v1/sections/Home/LogoMarquee";
import Quote from "@/components/v1/sections/Home/Quote";
import TrustedInBigLeagues from "@/components/v1/sections/Home/TrustedInBigLeagues";
import UseCaseBand from "@/components/v1/sections/Home/UseCaseBand";

/**
 * Homepage composition. Every section after the hero is a standard
 * `<Section>` on the shared 80/96/160 vertical rhythm, so the page
 * reads as a sequence of chapters rather than one long stack. The hero
 * owns the first screen (logo row anchored at the fold); the
 * capabilities chapter carries the page's one full-bleed colour moment.
 */
export default function Home() {
  return (
    <PageShell>
      <Hero />
      <Quote />
      <HowItWorks />
      <Capabilities />
      <UseCaseBand />
      <ItDoesntHaveToBeHard />
      <TrustedInBigLeagues />
      <LogoMarquee />
    </PageShell>
  );
}
