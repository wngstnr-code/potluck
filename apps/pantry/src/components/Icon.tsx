const PATHS = {
  home: <path d="M3 8l5-4.5L13 8v5H3z" />,
  shield: <path d="M8 1.8l5 2v4c0 3.2-2.2 5.2-5 6.4C5.2 13 3 11 3 7.8v-4z" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </>
  ),
  check: <path d="M3.5 8.5l3 3 6-6.5" />,
  bolt: <path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" />,
  cross: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  arrow: <path d="M4 12L12 4M6 4h6v6" />,
  collapse: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="2" />
      <path d="M6 2.5v11M11 6l-2 2 2 2" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 16,
  stroke = 1.7,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
