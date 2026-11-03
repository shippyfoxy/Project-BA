"use client";

import { useRef, useState } from "react";
import { fmtCompact, fmtDay, fmtInt, fmtLongDay } from "@/lib/format";

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  points: [number, number][]; // [x, y], sorted by x
  emphasis?: boolean;
  peak?: [number, number]; // marked with a dot
}

// Plain data only, so server pages can pass it straight through.
export interface LineChartProps {
  series: LineSeries[];
  xKind: "day" | "date"; // day = days since creation, date = UTC ms
  yKind: "pct" | "count";
  xMin: number;
  xMax: number;
  yMax: number;
  yStep: number;
  summary: string;
  height?: number;
  endLabels?: boolean;
  callout?: { x: number; y: number; text: string };
  marker?: { x: number; label: string }; // a dashed line for a change in method
  maxGap?: number; // in x units; wider gaps between points break the line
  width?: number; // drawing width in viewBox units; smaller for small multiples
}


const RIGHT_LABELS = 190;
const TOP = 14;
const DAY_MS = 86_400_000;

const fmtY = (kind: "pct" | "count", v: number, axis = false) =>
  kind === "pct" ? `${axis ? Math.round(v * 100) : (v * 100).toFixed(1)}%` : axis ? fmtCompact(v) : fmtInt(v);
const fmtX = (kind: "day" | "date", v: number, long = false) =>
  kind === "day" ? `Day ${Math.round(v)}` : long ? fmtLongDay(v) : fmtDay(v);

function xTicks(kind: "day" | "date", min: number, max: number): number[] {
  if (kind === "day") {
    const span = max - min;
    const step = [7, 15, 30, 60, 90].find((s) => span / s <= 7) ?? 120;
    const out: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
    return out;
  }
  const out: number[] = [];
  const d = new Date(min);
  for (let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); m <= max; m = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1)) out.push(m);
  return out;
}

export function LineChart({ series, xKind, yKind, xMin, xMax, yMax, yStep, summary, height = 290, endLabels = true, callout, marker, maxGap, width = 1000 }: LineChartProps) {
  const W = width;
  const LEFT = width < 600 ? 40 : 60;
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const H = height;
  const right = endLabels ? RIGHT_LABELS : 16;
  const span = Math.max(xMax - xMin, 1);
  const x = (v: number) => ((v - xMin) / span) * W;
  const y = (v: number) => H - (Math.min(v, yMax) / yMax) * H;
  const unit = xKind === "day" ? 1 : DAY_MS;

  const grid: number[] = [];
  for (let v = 0; v <= yMax + yStep / 2; v += yStep) grid.push(v);
  const ticks = W < 600 ? [] : xTicks(xKind, xMin, xMax).filter((t) => x(t) > 40 && x(t) < W - 40);

  // Paths break where there is no reading for longer than maxGap (a day by default).
  const gap = maxGap ?? unit * 1.5;
  const path = (pts: [number, number][]) =>
    pts.map(([px, py], i) => `${i && px - pts[i - 1][0] <= gap ? "L" : "M"}${x(px).toFixed(1)},${y(py).toFixed(1)}`).join("");
  // Hover snaps to x values that have data, so weekly series work too.
  const allX = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);

  // End labels sit at each line's last value, nudged apart so they never overlap.
  const labels = series
    .filter((s) => s.points.length)
    .map((s) => {
      const [lx, ly] = s.points[s.points.length - 1];
      return { s, lx, ly, ty: y(ly) };
    })
    .sort((a, b) => a.ty - b.ty);
  for (let i = 1; i < labels.length; i++) labels[i].ty = Math.max(labels[i].ty, labels[i - 1].ty + 17);

  function nearestX(clientX: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * (W + LEFT + right) - LEFT;
    const v = xMin + (Math.min(Math.max(vx, 0), W) / W) * span;
    return allX.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), allX[0]);
  }
  const valueAt = (s: LineSeries, at: number) => s.points.find(([px]) => px === at)?.[1];
  const hovered = hoverX === null ? [] : series.map((s) => ({ s, v: valueAt(s, hoverX) }));

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W + LEFT + right} ${H + TOP + 36}`}
        width="100%"
        role="img"
        aria-label={summary}
        tabIndex={0}
        className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerMove={(e) => setHoverX(nearestX(e.clientX))}
        onPointerLeave={() => setHoverX(null)}
        onBlur={() => setHoverX(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const d = e.key === "ArrowLeft" ? -1 : 1;
            setHoverX((v) => {
              const at = v === null ? (d > 0 ? -1 : allX.length) : allX.indexOf(v);
              return allX[Math.min(Math.max(at + d, 0), allX.length - 1)];
            });
          }
        }}
      >
        <g transform={`translate(${LEFT},${TOP})`} fontFamily="var(--font-geist-sans), sans-serif">
          {grid.map((v) => (
            <g key={v}>
              <line x1="0" x2={W} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--input)" : "var(--grid)"} />
              <text x="-10" y={y(v) + 4} fill="var(--muted-foreground)" fontSize="12" textAnchor="end">
                {fmtY(yKind, v, true)}
              </text>
            </g>
          ))}
          <g fill="var(--muted-foreground)" fontSize="12" textAnchor="middle">
            <text x="0" y={H + 22} textAnchor="start">
              {fmtX(xKind, xMin)}
            </text>
            {ticks.map((t) => (
              <text key={t} x={x(t)} y={H + 22}>
                {xKind === "day" ? t : fmtDay(t)}
              </text>
            ))}
            <text x={W} y={H + 22} textAnchor="end">
              {fmtX(xKind, xMax)}
            </text>
          </g>
          {marker && marker.x > xMin && marker.x <= xMax ? (
            <g>
              <line x1={x(marker.x)} x2={x(marker.x)} y1="0" y2={H} stroke="var(--muted-foreground)" strokeDasharray="2 4" />
              <text x={x(marker.x) - 6} y="12" textAnchor="end" fill="var(--muted-foreground)" fontSize="11">
                {marker.label}
              </text>
            </g>
          ) : null}
          {[...series].sort((a, b) => Number(!!a.emphasis) - Number(!!b.emphasis)).map((s) => (
            <path
              key={s.id}
              d={path(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.emphasis ? 3 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {series.map((s) =>
            s.peak ? <circle key={s.id} cx={x(s.peak[0])} cy={y(s.peak[1])} r="5" fill={s.color} stroke="var(--card)" strokeWidth="2" /> : null,
          )}
          {callout ? (
            <text
              x={x(callout.x) - 10}
              y={Math.max(y(callout.y) - 10, 12)}
              textAnchor="end"
              fill="var(--foreground)"
              fontSize="13"
              fontWeight="600"
              stroke="var(--card)"
              strokeWidth="4"
              paintOrder="stroke"
            >
              {callout.text}
            </text>
          ) : null}
          {endLabels
            ? labels.map(({ s, ly, ty }) => (
                <text key={s.id} x={W + 10} y={ty + 4} fill="var(--foreground)" fontSize="13" fontWeight={s.emphasis ? 600 : 400}>
                  {s.label.length > 18 ? `${s.label.slice(0, 17)}…` : s.label} · {fmtY(yKind, ly, yKind === "pct")}
                </text>
              ))
            : null}
          {hoverX !== null ? (
            <g pointerEvents="none">
              <line x1={x(hoverX)} x2={x(hoverX)} y1="0" y2={H} stroke="#5c6573" strokeDasharray="3 3" />
              {hovered.map(({ s, v }) =>
                v === undefined ? null : <circle key={s.id} cx={x(hoverX)} cy={y(v)} r="4.5" fill={s.color} stroke="var(--card)" strokeWidth="2" />,
              )}
            </g>
          ) : null}
        </g>
      </svg>
      {hoverX !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-48 rounded-lg border border-input bg-popover px-3 py-2 text-[13px] shadow-lg"
          style={{
            left: `${((LEFT + x(hoverX)) / (W + LEFT + right)) * 100}%`,
            transform: `translateX(${x(hoverX) > W * 0.6 ? "calc(-100% - 12px)" : "12px"})`,
          }}
        >
          <div className="font-medium">{fmtX(xKind, hoverX, true)}</div>
          {hovered.map(({ s, v }) => (
            <div key={s.id} className="mt-0.5 flex items-center justify-between gap-4 text-text-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="inline-block h-0.5 w-3 shrink-0 rounded" style={{ background: s.color }} aria-hidden="true" />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="tabular-nums text-foreground">{v === undefined ? "—" : fmtY(yKind, v)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {hoverX !== null
          ? `${fmtX(xKind, hoverX, true)}: ${hovered.map(({ s, v }) => `${s.label} ${v === undefined ? "no data" : fmtY(yKind, v)}`).join(", ")}`
          : ""}
      </p>
    </div>
  );
}
