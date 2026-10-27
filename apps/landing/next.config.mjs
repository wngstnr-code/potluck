// GitHub Pages serves the site under /potluck/, so the Pages build sets
// NEXT_BASE_PATH=/potluck; local dev leaves it empty and serves from /.
const basePath = process.env.NEXT_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // next/link and the CSS bundle apply basePath themselves; plain asset
  // strings (video, canvas, <Image> src) read it through utils/basePath.ts.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
