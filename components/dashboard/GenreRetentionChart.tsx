"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientOnly } from "@/components/dashboard/ClientOnly";
import type { GenreRow } from "@/lib/snapshot/aggregate";

interface Props {
  rows: GenreRow[];
}

const fmt = (n: number): string =>
  n >= 1 ? n.toFixed(2) : n.toFixed(3);

function GenreTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: GenreRow }> }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="font-medium text-foreground">{r.genre}</div>
      <div className="mt-1 text-muted-foreground">
        retention proxy: <span className="text-foreground tabular-nums">{fmt(r.retentionProxy)}</span>
      </div>
      <div className="text-muted-foreground">
        games: <span className="text-foreground tabular-nums">{r.count}</span>
      </div>
      <div className="text-muted-foreground">
        concurrent: <span className="text-foreground tabular-nums">{r.totalPlaying.toLocaleString("en-GB")}</span>
      </div>
    </div>
  );
}

export function GenreRetentionChart({ rows }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimated retention by genre</CardTitle>
        <CardDescription>
          Proxied from like-ratio × log10(favourites + 1) × current playing ÷
          (lifetime visits ÷ 24). Higher means more players are concentrated
          relative to a game&rsquo;s historical reach. Not a substitute for
          in-game telemetry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            No genres with enough games yet — try `pnpm refresh-data`.
          </div>
        ) : (
          <ClientOnly fallback={<div className="h-72 animate-pulse rounded-md bg-muted/30" />}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="genre"
                  angle={-25}
                  height={60}
                  textAnchor="end"
                  interval={0}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  width={48}
                />
                <Tooltip content={<GenreTooltip />} cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="retentionProxy" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          </ClientOnly>
        )}
      </CardContent>
    </Card>
  );
}
