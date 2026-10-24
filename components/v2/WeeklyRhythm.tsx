const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Bars of players per weekday as % of the weekly average; the dashed line is
// the average (100). Each bar has a native tooltip.
export function WeeklyRhythm({ rhythm }: { rhythm: { dow: number; index: number }[] }) {
  const max = 200;
  const h = 160;
  const y = (v: number) => h - (v / max) * h;
  const slot = 480 / 7;
  const summary = rhythm.map((r) => `${DAYS[r.dow - 1]} ${Math.round(r.index)}`).join(", ");
  return (
    <svg viewBox="0 0 520 200" width="100%" role="img" aria-label={`Players by weekday as % of the weekly average: ${summary}`} className="block">
      <g transform="translate(36,12)">
        <line x1="0" y1={h} x2="480" y2={h} stroke="var(--input)" />
        <line x1="0" y1={y(100)} x2="480" y2={y(100)} stroke="#3a4250" strokeDasharray="4 4" />
        <g fill="var(--muted-foreground)" fontSize="12" textAnchor="end">
          <text x="-8" y={h + 4}>0</text>
          <text x="-8" y={y(100) + 4}>100</text>
          <text x="-8" y={y(200) + 4}>200</text>
        </g>
        {rhythm.map((r) => {
          const x = (r.dow - 1) * slot + 10;
          const v = Math.round(r.index);
          return (
            <g key={r.dow}>
              <rect x={x} y={y(r.index)} width={48} height={h - y(r.index)} rx="4" fill="var(--rise)">
                <title>{`${DAYS[r.dow - 1]}: ${v}% of the weekly average`}</title>
              </rect>
              <text x={x + 24} y={y(r.index) - 6} fill="var(--foreground)" fontSize="12" fontWeight="600" textAnchor="middle">
                {v}
              </text>
              <text x={x + 24} y={h + 20} fill="var(--muted-foreground)" fontSize="12" textAnchor="middle">
                {DAYS[r.dow - 1]}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
