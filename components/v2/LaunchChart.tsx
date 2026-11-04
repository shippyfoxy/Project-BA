"use client";

import { useRef, useState } from "react";
import { fmtInt } from "@/lib/format";

// Plain data only, so the server page can pass it straight through.
export interface LaunchChartProps {
  bands: { day: number; p10: number; p25: number; p50: number; p75: number; p90: number }[];
  game?: { name: string; points: [number, number][] };
  summary: string;
}

const W = 1000;
const H = 320;
const LEFT = 56;
const RIGHT = 16;
const TOP = 14;
const BOTTOM = 30;

// Launches span zero to hundreds of thousands of players, so the scale is
// logarithmic, shifted by one so a day with nobody playing still has a place.
const ly = (v: number) => Math.log10(1 + Math.max(v, 0));
const TICKS = [0, 10, 100, 1_000, 10_000, 100_000, 1_000_000];
const tickLabel = (v: number) => (v >= 1_000_000 ? `${v / 1_000_000}M` : v >= 1_000 ? `${v / 1_000}k` : String(v));

export function LaunchChart({ bands, game, summary }: LaunchChartProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (!bands.length) return null;

  const maxDay = bands[bands.length - 1].day;
  const top = Math.max(...bands.map((b) => b.p90), ...(game?.points.map((p) => p[1]) ?? [0]), 100);
  const yMax = TICKS.find((t) => t >= top) ?? 1_000_000;
  // Rounded, so the server and the browser draw identical numbers (their
  // log10 can differ in the last digit, which breaks hydration).
  const round = (n: number) => Math.round(n * 10) / 10;
  const x = (d: number) => round(LEFT + (d / Math.max(maxDay, 1)) * (W - LEFT - RIGHT));
  const y = (v: number) => round(TOP + (1 - ly(v) / ly(yMax)) * (H - TOP - BOTTOM));
  const area = (lo: (b: (typeof bands)[number]) => number, hi: (b: (typeof bands)[number]) => number) =>
    `M${bands.map((b) => `${x(b.day).toFixed(1)},${y(hi(b)).toFixed(1)}`).join("L")}L${[...bands]
      .reverse()
      .map((b) => `${x(b.day).toFixed(1)},${y(lo(b)).toFixed(1)}`)
      .join("L")}Z`;
  const line = (pts: [number, number][]) => `M${pts.map(([d, v]) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join("L")}`;
  const gamePts = game?.points.filter(([d]) => d <= maxDay) ?? [];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const d = Math.round((((e.clientX - r.left) / r.width) * W - LEFT) / ((W - LEFT - RIGHT) / Math.max(maxDay, 1)));
    setHover(d >= 0 && d <= maxDay ? d : null);
  };
  const hb = hover === null ? null : bands.find((b) => b.day === hover);
  const hg = hover === null ? null : gamePts.find(([d]) => d === hover);
  const xTicks = [0, 7, 14, 30, 60, 90].filter((d) => d <= maxDay);

  return (
    <figure className="relative m-0">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none"
        role="img"
        aria-label={summary}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {TICKS.filter((t) => t <= yMax).map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={LEFT - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--muted-foreground)">
              {tickLabel(t)}
            </text>
          </g>
        ))}
        {xTicks.map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
            {d === 0 ? "Day 0" : `Day ${d}`}
          </text>
        ))}
        <path d={area((b) => b.p10, (b) => b.p90)} fill="var(--rise)" opacity="0.12" />
        <path d={area((b) => b.p25, (b) => b.p75)} fill="var(--rise)" opacity="0.26" />
        <path d={line(bands.map((b) => [b.day, b.p50]))} fill="none" stroke="var(--rise)" strokeWidth="2" />
        {gamePts.length ? <path d={line(gamePts)} fill="none" stroke="var(--foreground)" strokeWidth="2.5" strokeLinejoin="round" /> : null}
        {hb ? (
          <>
            <line x1={x(hb.day)} x2={x(hb.day)} y1={TOP} y2={H - BOTTOM} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
            <circle cx={x(hb.day)} cy={y(hb.p50)} r="4" fill="var(--rise)" stroke="var(--card)" strokeWidth="2" />
            {hg ? <circle cx={x(hg[0])} cy={y(hg[1])} r="5" fill="var(--foreground)" stroke="var(--card)" strokeWidth="2" /> : null}
          </>
        ) : null}
      </svg>
      {hb ? (
        <div
          className="pointer-events-none absolute top-2 rounded-xl border border-border bg-popover px-3 py-2 text-[13px] shadow-lg"
          style={{ left: `${(x(hb.day) / W) * 100}%`, transform: hb.day > maxDay / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
        >
          <div className="font-semibold">Day {hb.day}</div>
          {hg && game ? (
            <div className="tabular-nums">
              {game.name}: <strong>{fmtInt(hg[1])}</strong>
            </div>
          ) : null}
          <div className="tabular-nums text-text-2">Top 10% from {fmtInt(hb.p90)}</div>
          <div className="tabular-nums text-text-2">Top quarter from {fmtInt(hb.p75)}</div>
          <div className="tabular-nums text-text-2">Median {fmtInt(hb.p50)}</div>
        </div>
      ) : null}
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-2">
        {game ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-[3px] w-5 rounded bg-foreground" aria-hidden="true" />
            {game.name}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-[2px] w-5 rounded bg-rise" aria-hidden="true" />
          Median launch
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm bg-rise/40" aria-hidden="true" />
          Middle half
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm bg-rise/15" aria-hidden="true" />
          10th to 90th percentile
        </span>
        <span>Average players a day, log scale</span>
      </figcaption>
    </figure>
  );
}
