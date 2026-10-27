/**
 * The two faces of the "It doesn't have to be a stack" slider, drawn as
 * inline SVG on the slider frame's 1409 × 704 grid so they stay sharp at
 * any width.
 *
 * Before: the usual indexer stack, as a tangle of boxes the dApp team
 * has to run and users have to trust. After: the Potluck path, from a
 * spec to Portaldot to the user's browser, checked on arrival.
 */

const W = 1409;
const H = 704;
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const BOX_W = 250;
const BOX_H = 64;

// Before: boxes scattered on purpose so the wires cross.
const STACK = [
  { x: 150, y: 150, label: "archive node", sub: "RPC, 2 TB disk" },
  { x: 560, y: 120, label: "indexer service", sub: "handlers, retries" },
  { x: 980, y: 190, label: "postgres", sub: "backups, migrations" },
  { x: 230, y: 420, label: "GraphQL API", sub: "rate limits, keys" },
  { x: 640, y: 470, label: "hosting", sub: "$ / month, forever" },
  { x: 1030, y: 440, label: "“trust us”", sub: "no proof for users" },
];

const WIRES: [number, number][] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [2, 3],
  [0, 4],
  [2, 4],
  [3, 5],
  [4, 5],
  [0, 2],
];

const TROUBLE = [
  { x: 470, y: 330, text: "cron" },
  { x: 870, y: 360, text: "reorgs" },
  { x: 120, y: 330, text: "on-call" },
  { x: 1180, y: 330, text: "re-sync: 2–4 days" },
];

const centre = (i: number) => {
  const b = STACK[i] ?? { x: 0, y: 0 };
  return { x: b.x + BOX_W / 2, y: b.y + BOX_H / 2 };
};

export function StackBefore() {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 block h-full w-full"
      aria-hidden="true"
    >
      <rect width={W} height={H} fill="#0b1630" />
      <g stroke="#3a4e78" strokeWidth="1.5" fill="none" strokeDasharray="6 6">
        {WIRES.map(([a, b]) => {
          const p = centre(a);
          const q = centre(b);
          const mx = (p.x + q.x) / 2;
          return (
            <path
              key={`${a}-${b}`}
              d={`M${p.x} ${p.y} C${mx} ${p.y + 120} ${mx} ${q.y - 120} ${q.x} ${q.y}`}
            />
          );
        })}
      </g>
      {STACK.map((b) => (
        <g key={b.label}>
          <rect
            x={b.x}
            y={b.y}
            width={BOX_W}
            height={BOX_H}
            rx="8"
            fill="#13234a"
            stroke="#4a5f8a"
          />
          <text x={b.x + 18} y={b.y + 28} fill="#e4eaf4" fontFamily={MONO} fontSize="20">
            {b.label}
          </text>
          <text x={b.x + 18} y={b.y + 50} fill="#a9b6cf" fontFamily={MONO} fontSize="15">
            {b.sub}
          </text>
        </g>
      ))}
      {TROUBLE.map((t) => (
        <g key={t.text}>
          <rect
            x={t.x - 8}
            y={t.y - 20}
            width={t.text.length * 10.5 + 16}
            height={30}
            rx="15"
            fill="#3d1f2a"
            stroke="#e86154"
            strokeOpacity="0.6"
          />
          <text x={t.x} y={t.y} fill="#f2a39b" fontFamily={MONO} fontSize="16">
            {t.text}
          </text>
        </g>
      ))}
    </svg>
  );
}

// After: three clean stages left to right, joined by straight arrows.
const STAGES = [
  {
    x: 110,
    title: "spec.json",
    lines: ["which events → which rows", "how they reconcile"],
    note: "build once",
    accent: "#f2ef63",
  },
  {
    x: 540,
    title: "Portaldot",
    lines: ["TransactionStorage: chunks", "PotluckRegistry: manifest"],
    note: "bitswap_v1_get",
    accent: "#276ed2",
  },
  {
    x: 970,
    title: "your user’s browser",
    lines: ["L1 · L2 · L3 ✓", "live tail of new blocks"],
    note: "",
    accent: "#78d6a8",
  },
];

const STAGE_W = 330;
const STAGE_H = 190;
const STAGE_Y = 257;

export function StackAfter() {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 block h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="potluck-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10Z" fill="#cfd6e4" />
        </marker>
      </defs>
      <rect width={W} height={H} fill="#102a5c" />
      {STAGES.slice(0, -1).map((s, i) => {
        const next = STAGES[i + 1] ?? s;
        const y = STAGE_Y + STAGE_H / 2;
        return (
          <g key={s.title}>
            <line
              x1={s.x + STAGE_W + 12}
              y1={y}
              x2={next.x - 14}
              y2={y}
              stroke="#cfd6e4"
              strokeWidth="2"
              markerEnd="url(#potluck-arrow)"
            />
            <text
              x={(s.x + STAGE_W + next.x) / 2}
              y={y - 16}
              fill="#9fb0cc"
              fontFamily={MONO}
              fontSize="15"
              textAnchor="middle"
            >
              {s.note}
            </text>
          </g>
        );
      })}
      {STAGES.map((s) => (
        <g key={s.title}>
          <rect
            x={s.x}
            y={STAGE_Y}
            width={STAGE_W}
            height={STAGE_H}
            rx="14"
            fill="#173470"
            stroke={s.accent}
            strokeOpacity="0.8"
            strokeWidth="1.5"
          />
          <rect x={s.x} y={STAGE_Y} width="6" height={STAGE_H} rx="3" fill={s.accent} />
          <text x={s.x + 32} y={STAGE_Y + 58} fill="#ffffff" fontFamily={MONO} fontSize="24">
            {s.title}
          </text>
          {s.lines.map((line, i) => (
            <text
              key={line}
              x={s.x + 32}
              y={STAGE_Y + 104 + i * 32}
              fill="#b8c4d9"
              fontFamily={MONO}
              fontSize="17"
            >
              {line}
            </text>
          ))}
        </g>
      ))}
      <text x={W / 2} y={560} fill="#9fb0cc" fontFamily={MONO} fontSize="17" textAnchor="middle">
        no server · no database · no API key
      </text>
    </svg>
  );
}
