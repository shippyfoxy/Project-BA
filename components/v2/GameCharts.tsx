import { fmtCompact, fmtDay, fmtInt } from "@/lib/format";
import { niceMax } from "@/lib/stats";

const W = 1000;
const LEFT = 64;
const DAY_MS = 86_400_000;

// Bars of new visits per day, placed by date. Each bar has a native tooltip.
export function NewVisitsChart({ points, label }: { points: { dayMs: number; v: number }[]; label: string }) {
  const H = 160;
  const t0 = points[0].dayMs;
  const days = Math.max(Math.round((points[points.length - 1].dayMs - t0) / DAY_MS) + 1, 1);
  const slot = W / days;
  const { max, step } = niceMax(Math.max(...points.map((p) => p.v), 1));
  const y = (v: number) => H - (v / max) * H;
  const top = points.reduce((a, b) => (b.v > a.v ? b : a), points[0]);
  const topX = ((top.dayMs - t0) / DAY_MS) * slot + slot / 2;
  const grid: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) grid.push(v);
  return (
    <svg viewBox={`0 0 ${W + LEFT + 12} ${H + 44}`} width="100%" role="img" aria-label={label} className="block">
      <g transform={`translate(${LEFT},14)`}>
        {grid.map((v) => (
          <g key={v}>
            <line x1="0" x2={W} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--input)" : "var(--grid)"} />
            <text x="-10" y={y(v) + 5} fill="var(--muted-foreground)" fontSize="15" textAnchor="end">
              {fmtCompact(v)}
            </text>
          </g>
        ))}
        {points.map((p) => {
          const i = Math.round((p.dayMs - t0) / DAY_MS);
          return (
            <rect key={p.dayMs} x={i * slot + 1} y={y(p.v)} width={Math.max(slot - 2, 1)} height={H - y(p.v)} rx="2" fill="var(--rise)">
              <title>{`${fmtDay(p.dayMs)}: ${fmtInt(p.v)} new visits`}</title>
            </rect>
          );
        })}
        <text x={Math.min(Math.max(topX, 120), W - 120)} y={Math.max(y(top.v) - 6, 12)} fill="var(--foreground)" fontSize="15" fontWeight="600" textAnchor="middle">
          {fmtCompact(top.v)}, {fmtDay(top.dayMs)}
        </text>
        <g fill="var(--muted-foreground)" fontSize="15">
          <text x="0" y={H + 24}>{fmtDay(t0)}</text>
          <text x={W} y={H + 24} textAnchor="end">{fmtDay(points[points.length - 1].dayMs)}</text>
        </g>
      </g>
    </svg>
  );
}

// Upvote share over time on a zoomed scale that always ends at 100%.
export function LikeRatioChart({ points, label }: { points: { dayMs: number; ratio: number }[]; label: string }) {
  const H = 160;
  const t0 = points[0].dayMs;
  const t1 = points[points.length - 1].dayMs;
  const span = Math.max(t1 - t0, 1);
  const lo = Math.max(0, Math.floor((Math.min(...points.map((p) => p.ratio)) * 100 - 2) / 5) * 5) / 100;
  const x = (ms: number) => ((ms - t0) / span) * W;
  const y = (r: number) => H - ((r - lo) / (1 - lo)) * H;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.dayMs).toFixed(1)},${y(p.ratio).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  const grid: number[] = [];
  for (let v = lo; v <= 1.0001; v += 0.05) grid.push(v);
  return (
    <svg viewBox={`0 0 ${W + LEFT + 12} ${H + 44}`} width="100%" role="img" aria-label={label} className="block">
      <g transform={`translate(${LEFT},14)`}>
        {grid.map((v, i) => (
          <g key={i}>
            <line x1="0" x2={W} y1={y(v)} y2={y(v)} stroke={i === 0 ? "var(--input)" : "var(--grid)"} />
            <text x="-10" y={y(v) + 5} fill="var(--muted-foreground)" fontSize="15" textAnchor="end">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {points.length > 1 ? (
          <path d={path} fill="none" stroke="var(--rise)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        <circle cx={x(last.dayMs)} cy={y(last.ratio)} r="5" fill="var(--rise)" stroke="var(--card)" strokeWidth="2" />
        <text x={x(last.dayMs) - 10} y={y(last.ratio) + (y(last.ratio) > H - 30 ? -14 : 28)} fill="var(--foreground)" fontSize="15" fontWeight="600" textAnchor="end">
          {(last.ratio * 100).toFixed(1)}% now
        </text>
        <g fill="var(--muted-foreground)" fontSize="15">
          <text x="0" y={H + 24}>{fmtDay(t0)}</text>
          <text x={W} y={H + 24} textAnchor="end">{fmtDay(t1)}</text>
        </g>
      </g>
    </svg>
  );
}

interface Mark {
  value: number;
  label: string;
  strong?: boolean;
}

// One benchmark row: a scale with the genre's percentile marks and this game's dot.
export function BenchmarkScale({
  value,
  valueLabel,
  marks,
  band,
  min,
  max,
  log,
  minLabel,
  maxLabel,
  label,
}: {
  value: number;
  valueLabel: string;
  marks: Mark[];
  band?: [number, number];
  min: number;
  max: number;
  log?: boolean;
  minLabel: string;
  maxLabel: string;
  label: string;
}) {
  const w = 600;
  const pos = (v: number) => {
    const c = Math.min(Math.max(v, min), max);
    return log ? ((Math.log10(c) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))) * w : ((c - min) / (max - min)) * w;
  };
  // Nudge labels apart so neighbouring marks stay readable.
  const placed: number[] = [];
  const labelX = marks.map((m) => {
    let lx = pos(m.value);
    for (const p of placed) if (Math.abs(lx - p) < 90) lx = p + 90;
    placed.push(lx);
    return Math.min(lx, w - 30);
  });
  return (
    <div className="min-w-0 flex-[2_1_420px] overflow-x-auto">
    <svg viewBox="0 0 640 64" width="100%" role="img" aria-label={label} className="block min-w-[440px]">
      <g transform="translate(20,14)" fontFamily="var(--font-geist-sans), sans-serif">
        <rect x="0" y="12" width={w} height="8" rx="4" fill="var(--grid)" />
        {band ? <rect x={pos(band[0])} y="12" width={Math.max(pos(band[1]) - pos(band[0]), 2)} height="8" fill="var(--input)" /> : null}
        {marks.map((m, i) => (
          <g key={i}>
            <line x1={pos(m.value)} x2={pos(m.value)} y1="6" y2="26" stroke={m.strong ? "var(--text-2)" : "var(--muted-foreground)"} strokeWidth="2" />
            <text x={labelX[i]} y="42" fill="var(--muted-foreground)" fontSize="11" textAnchor="middle">
              {m.label}
            </text>
          </g>
        ))}
        <circle cx={pos(value)} cy="16" r="8" fill="var(--rise)" stroke="var(--card)" strokeWidth="2" />
        <text x={Math.min(Math.max(pos(value), 30), w - 30)} y="58" fill="var(--foreground)" fontSize="11" fontWeight="600" textAnchor="middle">
          {valueLabel}
        </text>
        <text x="0" y="2" fill="#6b7484" fontSize="10">{minLabel}</text>
        <text x={w} y="2" fill="#6b7484" fontSize="10" textAnchor="end">{maxLabel}</text>
      </g>
    </svg>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// This game vs all tracked games by weekday, as % of each one's weekly average.
export function WeeklyCompare({ rhythm, name }: { rhythm: { dow: number; game: number; all: number }[]; name: string }) {
  const H = 160;
  const top = Math.max(...rhythm.flatMap((r) => [r.game, r.all]));
  const { max } = niceMax(top * 1.1);
  const y = (v: number) => H - (v / max) * H;
  const slot = 510 / 7;
  const summary = rhythm.map((r) => `${DAYS[r.dow - 1]} ${Math.round(r.game)} vs ${Math.round(r.all)}`).join(", ");
  return (
    <svg viewBox="0 0 560 210" width="100%" role="img" aria-label={`Players by weekday as % of the weekly average, ${name} vs all tracked games: ${summary}`} className="block">
      <g transform="translate(40,12)">
        <line x1="0" x2="510" y1={H} y2={H} stroke="var(--input)" />
        <line x1="0" x2="510" y1={y(100)} y2={y(100)} stroke="#3a4250" strokeDasharray="4 4" />
        <g fill="var(--muted-foreground)" fontSize="12" textAnchor="end">
          <text x="-8" y={H + 4}>0</text>
          <text x="-8" y={y(100) + 4}>100</text>
        </g>
        {rhythm.map((r) => {
          const x0 = (r.dow - 1) * slot + 8;
          return (
            <g key={r.dow}>
              <rect x={x0} y={y(r.game)} width="28" height={H - y(r.game)} rx="4" fill="var(--rise)">
                <title>{`${DAYS[r.dow - 1]}: ${name} ${Math.round(r.game)}% of its weekly average`}</title>
              </rect>
              <rect x={x0 + 30} y={y(r.all)} width="28" height={H - y(r.all)} rx="4" fill="#5c6573">
                <title>{`${DAYS[r.dow - 1]}: all tracked games ${Math.round(r.all)}%`}</title>
              </rect>
              <text x={x0 + 14} y={y(r.game) - 6} fill="var(--foreground)" fontSize="12" fontWeight="600" textAnchor="middle">
                {Math.round(r.game)}
              </text>
              <text x={x0 + 29} y={H + 20} fill="var(--muted-foreground)" fontSize="12" textAnchor="middle">
                {DAYS[r.dow - 1]}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
