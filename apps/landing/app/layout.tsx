import type { Metadata } from "next";

import { DEFAULT_SOCIAL_IMAGE, getFullURL, SITE_URL } from "src/utils/social";

import "@potluck/theme/fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Potluck: verifiable on-chain history on Portaldot",
    template: "%s | Potluck",
  },
  openGraph: {
    siteName: "Potluck",
    images: [getFullURL(DEFAULT_SOCIAL_IMAGE)],
  },
  icons: {
    icon: [{ url: "favicon.svg", type: "image/svg+xml" }],
  },
};

// Root layout is intentionally chrome-free: it only sets up <html>/<body>
// and the self-hosted IBM Plex faces (@potluck/theme). Page chrome comes
// from PageShell. No request-time APIs, so the page prerenders statically.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="dark font-sans text-basis">{children}</body>
    </html>
  );
}
