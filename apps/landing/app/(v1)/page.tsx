import type { Metadata } from "next";
import { generateMetadata, SITE_URL } from "src/utils/social";
import HomeV1 from "@/components/v1/pages/Home";

const TITLE = "Potluck: verifiable on-chain history on Portaldot";

export const metadata: Metadata = {
  ...generateMetadata({
    title: TITLE,
    description:
      "Load any dApp's on-chain history in seconds, straight from Portaldot, and verify it against the source chain in your browser. No indexer, no API, no server.",
  }),
  // The home page carries the full name, so skip the "%s | Potluck" template.
  title: { absolute: TITLE },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Potluck",
    url: SITE_URL,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Potluck",
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    description:
      "Verifiable on-chain history stored on Portaldot: chunks in TransactionStorage, manifests in a PotluckRegistry contract, checked in the browser against the source chain.",
    codeRepository: "https://github.com/wngstnr-code/potluck",
  },
];

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD built from constants above
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <HomeV1 />
    </>
  );
}
