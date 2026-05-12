"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClientOnly } from "@/components/dashboard/ClientOnly";
import type { CohortRow, TopGameRow } from "@/lib/snapshot/aggregate";

interface Props {
  rows: CohortRow[];
  hasCohortData: boolean;
}

const fmtCompact = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function CohortTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CohortRow }>;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="font-medium text-foreground">{r.bucket}</div>
      <div className="mt-1 text-muted-foreground">
        games:{" "}
        <span className="text-foreground tabular-nums">{r.count}</span>
      </div>
      <div className="text-muted-foreground">
        concurrent:{" "}
        <span className="text-foreground tabular-nums">
          {r.totalPlaying.toLocaleString("en-GB")}
        </span>
      </div>
      <div className="mt-1 text-xs text-primary">Click to see top games</div>
    </div>
  );
}

function TopGamesPanel({
  bucket,
  games,
}: {
  bucket: string;
  games: TopGameRow[];
}) {
  if (games.length === 0) {
    return (
      <div className="border-t border-border pt-4 text-sm text-muted-foreground">
        No games in this bucket yet.
      </div>
    );
  }
  return (
    <div className="border-t border-border pt-4">
      <p className="mb-2 text-sm font-medium">
        Top games — session{" "}
        <span className="text-primary">{bucket}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-1 pr-4 font-medium">#</th>
              <th className="pb-1 pr-4 font-medium">Game</th>
              <th className="pb-1 pr-4 text-right font-medium">Retention</th>
              <th className="pb-1 text-right font-medium">Concurrent</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g, i) => (
              <tr
                key={g.universeId}
                className="border-b border-border/50 last:border-0"
              >
                <td className="py-1.5 pr-4 tabular-nums text-muted-foreground">
                  {i + 1}
                </td>
                <td className="py-1.5 pr-4">
                  <a
                    href={`https://www.roblox.com${g.canonicalUrlPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:text-primary hover:underline"
                  >
                    {g.name}
                  </a>
                  <span className="ml-2 text-muted-foreground">
                    {g.creatorName}
                  </span>
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {g.retentionProxy.toFixed(2)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {fmtCompact.format(g.playing)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SessionCohortChart({ rows, hasCohortData }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRow = rows.find((r) => r.bucket === selected) ?? null;

  function handleClick(data: unknown) {
    const bucket = (data as { activeLabel?: string }).activeLabel;
    if (!bucket) return;
    setSelected((prev) => (prev === bucket ? null : bucket));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimated session-length cohorts</CardTitle>
        <CardDescription>
          Bucketed by concurrent players ÷ visit velocity between the last two
          snapshots. Needs at least two refreshes to populate. Click a bar to
          see the top-performing games in that session bucket.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasCohortData ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <div>No cohort data yet.</div>
            <div className="max-w-sm text-xs">
              Run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                pnpm refresh-data
              </code>{" "}
              a second time so the script can compute visit velocity from two
              samples.
            </div>
          </div>
        ) : (
          <ClientOnly
            fallback={<div className="h-72 animate-pulse rounded-md bg-muted/30" />}
          >
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                  onClick={handleClick}
                  style={{ cursor: "pointer" }}
                >
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
                  <Tooltip
                    content={<CohortTooltip />}
                    cursor={{ fill: "var(--accent)" }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {rows.map((r) => (
                      <Cell
                        key={r.bucket}
                        fill="var(--primary)"
                        opacity={
                          selected === null || selected === r.bucket ? 1 : 0.35
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ClientOnly>
        )}

        {selectedRow && (
          <TopGamesPanel bucket={selectedRow.bucket} games={selectedRow.topGames} />
        )}
      </CardContent>
    </Card>
  );
}
