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
import type { CohortRow } from "@/lib/snapshot/aggregate";

interface Props {
  rows: CohortRow[];
  hasCohortData: boolean;
}

function CohortTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: CohortRow }> }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="font-medium text-foreground">{r.bucket}</div>
      <div className="mt-1 text-muted-foreground">
        games: <span className="text-foreground tabular-nums">{r.count}</span>
      </div>
      <div className="text-muted-foreground">
        concurrent: <span className="text-foreground tabular-nums">{r.totalPlaying.toLocaleString("en-GB")}</span>
      </div>
    </div>
  );
}

export function SessionCohortChart({ rows, hasCohortData }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimated session-length cohorts</CardTitle>
        <CardDescription>
          Bucketed by current concurrent players ÷ visit velocity over the
          window between the last two snapshots. Needs at least two refreshes
          to populate. Not a substitute for in-game telemetry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasCohortData ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <div>No cohort data yet.</div>
            <div className="max-w-sm text-xs">
              Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">pnpm refresh-data</code> a
              second time (ideally a few minutes after the first) so the script
              can compute visit velocity from two samples.
            </div>
          </div>
        ) : (
          <ClientOnly fallback={<div className="h-72 animate-pulse rounded-md bg-muted/30" />}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  width={40}
                  allowDecimals={false}
                />
                <Tooltip content={<CohortTooltip />} cursor={{ fill: "var(--accent)" }} />
                <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          </ClientOnly>
        )}
      </CardContent>
    </Card>
  );
}
