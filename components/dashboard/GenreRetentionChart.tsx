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
import type { GenreRow, TopGameRow } from "@/lib/snapshot/aggregate";

interface Props {
  rows: GenreRow[];
}

const fmtCompact = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function GenreTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: GenreRow }>;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="font-medium text-foreground">{r.genre}</div>
      <div className="mt-1 text-muted-foreground">
        retention proxy:{" "}
        <span className="text-foreground tabular-nums">
          {r.retentionProxy.toFixed(2)}
        </span>
      </div>
      <div className="text-muted-foreground">
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

function TopGamesPanel({ genre, games }: { genre: string; games: TopGameRow[] }) {
  return (
    <div className="border-t border-border pt-4">
      <p className="mb-2 text-sm font-medium">
        Top games — <span className="text-primary">{genre}</span>
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
              <tr key={g.universeId} className="border-b border-border/50 last:border-0">
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
                  <span className="ml-2 text-muted-foreground">{g.creatorName}</span>
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

export function GenreRetentionChart({ rows }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const selectedRow = rows.find((r) => r.genre === selected) ?? null;

  function handleClick(data: unknown) {
    const genre = (data as { activeLabel?: string }).activeLabel;
    if (!genre) return;
    setSelected((prev) => (prev === genre ? null : genre));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimated retention by genre</CardTitle>
        <CardDescription>
          Proxied from like-ratio × log₁₀(favourites + 1) × log₁₀(concurrent + 1).
          Higher means more players are concentrated relative to engagement
          signals. Click a bar to see top-performing games in that genre.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            No genres with enough games yet — try `pnpm refresh-data`.
          </div>
        ) : (
          <ClientOnly fallback={<div className="h-72 animate-pulse rounded-md bg-muted/30" />}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  margin={{ top: 8, right: 12, left: 4, bottom: 32 }}
                  onClick={handleClick}
                  style={{ cursor: "pointer" }}
                >
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
                  <Bar dataKey="retentionProxy" radius={[6, 6, 0, 0]}>
                    {rows.map((r) => (
                      <Cell
                        key={r.genre}
                        fill={
                          selected === null || selected === r.genre
                            ? "var(--primary)"
                            : "var(--muted-foreground)"
                        }
                        opacity={selected === null || selected === r.genre ? 1 : 0.35}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ClientOnly>
        )}

        {selectedRow && (
          <TopGamesPanel genre={selectedRow.genre} games={selectedRow.topGames} />
        )}
      </CardContent>
    </Card>
  );
}
