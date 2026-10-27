import type { Metadata } from "next";

/** Where the landing page is published (GitHub Pages). */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://wngstnr-code.github.io/potluck/";

/** Social card: the demo video's title frame. */
export const DEFAULT_SOCIAL_IMAGE = "assets/home/potluck-demo-poster.jpg";

export const getFullURL = (relativePath: string) =>
  new URL(relativePath.replace(/^\//, ""), SITE_URL).toString();

export const generateMetadata = ({
  title,
  description,
  image = DEFAULT_SOCIAL_IMAGE,
  ...rest
}: {
  title: string;
  description?: string;
  /** A site-relative path to the image. */
  image?: string;
  robots?: string;
}): Metadata => {
  const imageUrl = getFullURL(image);
  const metadata: Metadata = {
    title,
    openGraph: {
      title,
      images: [imageUrl],
    },
    twitter: {
      card: "summary_large_image",
      title,
      images: [imageUrl],
    },
    ...rest,
  };
  if (description) {
    metadata.description = description;
    metadata.openGraph.description = description;
    metadata.twitter.description = description;
  }
  return metadata;
};
