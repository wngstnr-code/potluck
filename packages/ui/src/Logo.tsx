/**
 * The Potluck mark (docs/brand/potluck-mark.svg) without its tile: a lowercase p whose bowl holds
 * four chunks. The rail's `.logo` tile supplies the yellow background, so the fourth chunk reads as
 * the tile showing through.
 */
export function PotluckMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M17 13H39A10 10 0 0 1 49 23V33A10 10 0 0 1 39 43H25V55H17Z" fill="var(--navy)" />
      <rect x="25" y="20" width="8" height="8" rx="1.5" fill="var(--blue)" />
      <rect x="35" y="20" width="7" height="8" rx="1.5" fill="var(--series-4)" />
      <rect x="25" y="30" width="8" height="6" rx="1.5" fill="var(--series-5)" />
      <rect x="35" y="30" width="7" height="6" rx="1.5" fill="var(--yellow)" />
    </svg>
  );
}
