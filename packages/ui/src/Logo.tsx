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

/**
 * The Wasiat-lite mark (docs/brand/wasiat-mark.svg) without its teal tile: a key, the control of an
 * account that passes to the inheritor, whose bow holds the friends who vouch (the same chunk grid
 * as the Potluck p). The fourth chunk is the tile showing through.
 */
export function WasiatMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M17 17H32A8 8 0 0 1 40 25V39A8 8 0 0 1 32 47H17A8 8 0 0 1 9 39V25A8 8 0 0 1 17 17Z"
        fill="var(--navy)"
      />
      <rect x="15" y="23" width="9" height="9" rx="1.5" fill="var(--blue)" />
      <rect x="26" y="23" width="8" height="9" rx="1.5" fill="var(--series-4)" />
      <rect x="15" y="34" width="9" height="7" rx="1.5" fill="var(--yellow)" />
      <rect x="26" y="34" width="8" height="7" rx="1.5" fill="var(--series-5)" />
      <path d="M40 28H56V36H52V44H46V36H40Z" fill="var(--navy)" />
    </svg>
  );
}
