"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UnifiedGameRow } from "@/lib/snapshot/aggregate";

const fmt = new Intl.NumberFormat("en-GB");
const fmtCompact = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type SortKey = "retention" | "concurrent" | "visits" | "trend";

const SORT_OPTIONS: Array<{ key: SortKey; label: string; help: string }> = [
  { key: "retention", label: "Retention score", help: "Quality × fandom × current activity" },
  { key: "concurrent", label: "Concurrent players", help: "Live players right now" },
  { key: "visits", label: "Lifetime visits", help: "Cumulative sessions ever" },
  { key: "trend", label: "Rising fastest", help: "Largest concurrent player gain across the rolling sample window" },
];

interface Props {
  rows: UnifiedGameRow[];
  defaultSort?: SortKey;
  limit?: number;
}

export function TopGamesPanel({ rows, defaultSort = "retention", limit = 10 }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort);

  const sorted = useMemo(() => {
    const score = (r: UnifiedGameRow) => {
      switch (sortKey) {
        case "concurrent":
          return r.playing;
        case "visits":
          return r.visits;
        case "trend":
          return r.concurrencyDelta ?? -Infinity;
        case "retention":
        default:
          return r.retentionProxy;
      }
    };
    return [...rows].sort((a, b) => score(b) - score(a)).slice(0, limit);
  }, [rows, sortKey, limit]);

  const helpForCurrent =
    SORT_OPTIONS.find((o) => o.key === sortKey)?.help ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top games</CardTitle>
        <CardDescription>
          One leaderboard, four lenses. Pick the lens that answers your
          question. <span className="text-foreground">{helpForCurrent}</span>
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-3">
          {SORT_OPTIONS.map((o) => (
            <Button
              key={o.key}
              size="sm"
              variant={o.key === sortKey ? "default" : "outline"}
              onClick={() => setSortKey(o.key)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-right">#</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">Concurrent</TableHead>
                <TableHead>12h trend</TableHead>
                <TableHead className="text-right">Lifetime visits</TableHead>
                <TableHead className="text-right">Retention score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r, i) => (
                <TableRow key={r.universeId}>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {i + 1}
                  </TableCell>
                  <TableCell>
                    <a
                      href={`https://www.roblox.com${r.canonicalUrlPath}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground hover:underline"
                    >
                      {r.name}
                    </a>
                    <div className="text-xs text-muted-foreground">{r.creatorName}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">{r.genreL1}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.format(r.playing)}</TableCell>
                  <TableCell>
                    <TrendCell
                      values={r.concurrencySeries}
                      delta={r.concurrencyDelta}
                      deltaPct={r.concurrencyDeltaPct}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCompact.format(r.visits)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {r.retentionProxy.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendCell({
  values,
  delta,
  deltaPct,
}: {
  values: number[];
  delta: number | null;
  deltaPct: number | null;
}) {
  if (values.length < 2 || delta === null) {
    return <span className="text-xs text-muted-foreground">no history yet</span>;
  }
  const rising = delta > 0;
  const flat = delta === 0;
  const colorClass = flat
    ? "text-muted-foreground"
    : rising
      ? "text-emerald-500"
      : "text-rose-500";
  return (
    <div className={`flex items-center gap-2 ${colorClass}`}>
      <Sparkline values={values} />
      <span className="text-xs tabular-nums">
        {rising ? "+" : ""}
        {deltaPct === null ? `${delta}` : `${(deltaPct * 100).toFixed(1)}%`}
      </span>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 70;
  const height = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" points={points} />
    </svg>
  );
}
