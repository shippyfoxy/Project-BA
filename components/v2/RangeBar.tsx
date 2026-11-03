// A distribution at a glance: the middle half of values as a bar, a tick at
// the median and, optionally, a dot where the top 10% begin. With `zero`, a
// line marks no change, so rises and falls read either side of it.
export function RangeBar({
  p25,
  p50,
  p75,
  p90,
  min,
  max,
  zero,
  label,
  width = 220,
}: {
  p25: number;
  p50: number;
  p75: number;
  p90?: number;
  min: number;
  max: number;
  zero?: number;
  label: string;
  width?: number;
}) {
  const inner = width - 4;
  const sx = (v: number) => ((Math.min(Math.max(v, min), max) - min) / (max - min)) * inner + 2;
  const tone = zero === undefined ? "var(--rise)" : p50 >= zero ? "var(--rise)" : "var(--fall)";
  return (
    <svg width={width} height="18" viewBox={`0 0 ${width} 18`} role="img" aria-label={label} className="block">
      <rect x="2" y="8" width={inner} height="2" rx="1" fill="var(--grid)" />
      {zero !== undefined ? <line x1={sx(zero)} x2={sx(zero)} y1="0" y2="18" stroke="var(--muted-foreground)" strokeDasharray="2 2" /> : null}
      <rect x={sx(p25)} y="4" width={Math.max(sx(p75) - sx(p25), 2)} height="10" rx="3" fill={tone} opacity="0.55" />
      <line x1={sx(p50)} x2={sx(p50)} y1="1" y2="17" stroke="var(--foreground)" strokeWidth="2" />
      {p90 !== undefined ? <circle cx={sx(p90)} cy="9" r="3.5" fill={tone} stroke="var(--card)" strokeWidth="1.5" /> : null}
    </svg>
  );
}
