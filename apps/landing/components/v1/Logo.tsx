import { cn } from "@/utils/v1/cn";

/*
 * Potluck lockup: the p monogram on its yellow tile (docs/brand/potluck-mark.svg)
 * plus the "potluck" wordmark, set as live text in IBM Plex Sans 600
 * (docs/DESIGN.md §5: the wordmark is never outlined into the files).
 *
 * `width` is the full lockup width; the tile is sized from it so call sites
 * keep one number. Transitions are gated by `motion-safe:` so they no-op for
 * users with `prefers-reduced-motion: reduce`.
 */

// Lockup proportions at the 116px reference width: 24px tile + 8px gap + wordmark.
const FULL_WIDTH = 116;
const TILE = 24;
const GAP = 8;

interface LogoProps {
  /** Visible width in CSS pixels. Proportions are preserved. */
  width?: number;
  /** Scroll-driven shrink: keep the lockup mounted but animate the box
   *  down to just the tile. Use `logomarkOnly` for a static tile. */
  compact?: boolean;
  /** Render just the tile statically; `width` sizes the tile directly. */
  logomarkOnly?: boolean;
  className?: string;
}

export default function Logo({
  width = FULL_WIDTH,
  compact = false,
  logomarkOnly = false,
  className,
}: LogoProps) {
  const scale = logomarkOnly ? width / TILE : width / FULL_WIDTH;
  const tile = TILE * scale;
  const visibleWidth = logomarkOnly || compact ? tile : width;

  return (
    <span
      className={cn(
        "inline-flex items-center overflow-hidden whitespace-nowrap motion-safe:transition-[width] motion-safe:duration-[250ms] motion-safe:ease-v1-out",
        className,
      )}
      style={{ width: visibleWidth, height: tile, columnGap: GAP * scale }}
      role="img"
      aria-label="Potluck"
    >
      <PotluckTile size={tile} />
      {!logomarkOnly && (
        <span
          aria-hidden="true"
          className="font-potluck font-semibold leading-none tracking-[-0.01em] motion-safe:transition-opacity motion-safe:duration-[250ms] motion-safe:ease-v1-out"
          style={{ fontSize: 21 * scale, opacity: compact ? 0 : 1 }}
        >
          potluck
        </span>
      )}
    </span>
  );
}

function PotluckTile({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="shrink-0"
      style={{ display: "block" }}
    >
      <rect width="64" height="64" rx="20" fill="#f2ef63" />
      <path d="M17 13H39A10 10 0 0 1 49 23V33A10 10 0 0 1 39 43H25V55H17Z" fill="#122b67" />
      <rect x="25" y="20" width="8" height="8" rx="1.5" fill="#276ed2" />
      <rect x="35" y="20" width="7" height="8" rx="1.5" fill="#e86154" />
      <rect x="25" y="30" width="8" height="6" rx="1.5" fill="#21adad" />
      <rect x="35" y="30" width="7" height="6" rx="1.5" fill="#f2ef63" />
    </svg>
  );
}
