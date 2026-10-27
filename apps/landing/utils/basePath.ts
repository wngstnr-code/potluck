/** The path the site is served under ("" locally, "/potluck" on GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes a public-folder path ("/assets/…") with the base path. */
export const withBase = (path: string) => `${BASE_PATH}${path}`;
