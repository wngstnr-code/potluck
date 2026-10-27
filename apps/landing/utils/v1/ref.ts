/**
 * Attribution hook kept from the original marketing site's `?ref=<source>`
 * scheme. Potluck runs no analytics, so links are returned unchanged; the
 * call sites stay so a privacy-friendly scheme can be added in one place.
 */
export function appendRef(url: string, _ref: string): string {
  return url;
}
