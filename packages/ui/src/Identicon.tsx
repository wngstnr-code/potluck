/** 5×5 mirrored identicon drawn from the account's own bytes: solid hue, white pattern. */
export function Identicon({ account }: { account: string | undefined }) {
  if (!account) return <span className="idn idn-none">—</span>;
  const hex = account.replace(/^0x/, "");
  const byte = (i: number) =>
    Number.parseInt(hex.slice((i * 2) % hex.length, ((i * 2) % hex.length) + 2), 16) || 0;
  const hue = Math.round((byte(0) / 255) * 360);
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (byte(1 + y * 3 + x) % 2 === 0) continue;
      cells.push({ x, y });
      if (x < 2) cells.push({ x: 4 - x, y });
    }
  }
  return (
    <svg
      className="idn"
      viewBox="-0.5 -0.5 6 6"
      style={{ background: `oklch(0.55 0.15 ${hue})`, fill: `oklch(0.98 0.01 ${hue})` }}
      aria-hidden="true"
    >
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" />
      ))}
    </svg>
  );
}
