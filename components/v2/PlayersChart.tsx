"use client";

import { useRef, useState } from "react";
import { fmtCompact, fmtDay, fmtInt, fmtLongDay } from "@/lib/format";
import { niceMax } from "@/lib/stats";

export interface PlayersPoint {
  dayMs: number;
  avg: number;
  r7: number;
}

const W = 1000;
const H = 290;
const LEFT = 64;
const TOP = 14;


export function PlayersChart({ points, peak, summary }: { points: PlayersPoint[]; peak: PlayersPoint; summary: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const t0 = points[0].dayMs;
  const t1 = points[points.length - 1].dayMs;
  const span = Math.max(t1 - t0, 1);
  const { max, step } = niceMax(Math.max(...points.map((p) => Math.max(p.avg, p.r7))));
  const x = (ms: number) => ((ms - t0) / span) * W;
  const y = (v: number) => H - (v / max) * H;
  const path = (key: "avg" | "r7") => points.map((p, i) => `${i ? "L" : "M"}${x(p.dayMs).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");

  const grid: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) grid.push(v);

  // Month starts inside the range, skipping any that would crowd the edges.
  const ticks: number[] = [];
  const start = new Date(t0);
  for (let m = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1); m < t1; m = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1)) {
    if (x(m) > 50 && x(m) < W - 60) ticks.push(m);
  }

  function nearest(clientX: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * (W + LEFT + 12) - LEFT;
    const ms = t0 + (Math.min(Math.max(vx, 0), W) / W) * span;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].dayMs - ms) < Math.abs(points[best].dayMs - ms)) best = i;
    return best;
  }

  const h = hover === null ? null : points[hover];
  const peakLeft = x(peak.dayMs) > W - 220;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W + LEFT + 12} ${H + TOP + 40}`}
        width="100%"
        role="img"
        aria-label={summary}
        tabIndex={0}
        className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerMove={(e) => setHover(nearest(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const d = e.key === "ArrowLeft" ? -1 : 1;
            setHover((i) => Math.min(Math.max((i ?? (d > 0 ? -1 : points.length)) + d, 0), points.length - 1));
          }
        }}
      >
        <g transform={`translate(${LEFT},${TOP})`} fontFamily="var(--font-geist-sans), sans-serif">
          {grid.map((v) => (
            <g key={v}>
              <line x1="0" x2={W} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--input)" : "var(--grid)"} />
              <text x="-10" y={y(v) + 4} fill="var(--muted-foreground)" fontSize="12" textAnchor="end">
                {fmtCompact(v)}
              </text>
            </g>
          ))}
          <g fill="var(--muted-foreground)" fontSize="12">
            <text x="0" y={H + 22}>{fmtDay(t0)}</text>
            {ticks.map((m) => (
              <text key={m} x={x(m)} y={H + 22} textAnchor="middle">
                {fmtDay(m)}
              </text>
            ))}
            <text x={W} y={H + 22} textAnchor="end">{fmtDay(t1)}</text>
          </g>
          <path d={path("avg")} fill="none" stroke="#6b7484" strokeWidth="1.5" strokeLinejoin="round" />
          <path d={path("r7")} fill="none" stroke="var(--rise)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(peak.dayMs)} cy={y(peak.r7)} r="5.5" fill="var(--rise)" stroke="var(--card)" strokeWidth="2" />
          <g textAnchor={peakLeft ? "end" : "start"} stroke="var(--card)" strokeWidth="4" paintOrder="stroke" strokeLinejoin="round">
            <text x={x(peak.dayMs) + (peakLeft ? -12 : 12)} y={y(peak.r7) + (y(peak.r7) < 30 ? 22 : -16)} fill="var(--foreground)" fontSize="13" fontWeight="600">
              Peak {fmtCompact(peak.r7)}
            </text>
            <text x={x(peak.dayMs) + (peakLeft ? -12 : 12)} y={y(peak.r7) + (y(peak.r7) < 30 ? 38 : 0)} fill="var(--muted-foreground)" fontSize="12">
              7-day average, {fmtDay(peak.dayMs)}
            </text>
          </g>
          {h ? (
            <g pointerEvents="none">
              <line x1={x(h.dayMs)} x2={x(h.dayMs)} y1="0" y2={H} stroke="#5c6573" strokeDasharray="3 3" />
              <circle cx={x(h.dayMs)} cy={y(h.avg)} r="4" fill="#6b7484" stroke="var(--card)" strokeWidth="2" />
              <circle cx={x(h.dayMs)} cy={y(h.r7)} r="5" fill="var(--rise)" stroke="var(--card)" strokeWidth="2" />
            </g>
          ) : null}
        </g>
      </svg>
      {h ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-input bg-popover px-3 py-2 text-[13px] shadow-lg"
          style={{
            left: `${((LEFT + x(h.dayMs)) / (W + LEFT + 12)) * 100}%`,
            transform: `translateX(${x(h.dayMs) > W * 0.7 ? "calc(-100% - 12px)" : "12px"})`,
          }}
        >
          <div className="font-medium">{fmtLongDay(h.dayMs)}</div>
          <div className="mt-1 flex items-center justify-between gap-4 text-text-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded bg-rise" aria-hidden="true" />7-day average
            </span>
            <span className="tabular-nums text-foreground">{fmtInt(h.r7)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-text-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded bg-[#6b7484]" aria-hidden="true" />Daily average
            </span>
            <span className="tabular-nums text-foreground">{fmtInt(h.avg)}</span>
          </div>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {h ? `${fmtLongDay(h.dayMs)}: 7-day average ${fmtInt(h.r7)}, daily average ${fmtInt(h.avg)}` : ""}
      </p>
    </div>
  );
}
