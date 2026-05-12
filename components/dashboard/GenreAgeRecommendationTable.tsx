"use client";

import { useState } from "react";
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
import type { GenreAgeRow, TopGameRow } from "@/lib/snapshot/aggregate";

const fmt = new Intl.NumberFormat("en-GB");
const fmtCompact = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 1,
});

function fmtHour(h: number | null): string {
  if (h === null) return "—";
  return `${String(h).padStart(2, "0")}:00 UTC`;
}

function DrillDown({ games }: { games: TopGameRow[] }) {
  return (
    <div className="px-4 pb-3 pt-2">
      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Top games in this combination
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-1 pr-3 font-medium">#</th>
            <th className="pb-1 pr-3 font-medium">Game</th>
            <th className="pb-1 pr-3 text-right font-medium">Retention</th>
            <th className="pb-1 text-right font-medium">Concurrent</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g, i) => (
            <tr key={g.universeId} className="border-b border-border/40 last:border-0">
              <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                {i + 1}
              </td>
              <td className="py-1.5 pr-3">
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
              <td className="py-1.5 pr-3 text-right tabular-nums">
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
  );
}

interface Props {
  rows: GenreAgeRow[];
}

export function GenreAgeRecommendationTable({ rows }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  function toggle(key: string) {
    setExpanded((prev) => (prev === key ? null : key));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where retention is strongest</CardTitle>
        <CardDescription>
          Genre × age-rating combinations ranked by an{" "}
          <strong>adjusted</strong> retention score that pulls small-sample
          combos toward the catalogue mean &mdash; so a 7-game combo can&rsquo;t
          beat a 200-game combo on the strength of two outliers. Combos with
          fewer than ten games are filtered out entirely. The{" "}
          <em>Player share</em> column surfaces how mainstream vs niche each
          combo&rsquo;s audience actually is. <em>Peak hour</em> is the UTC
          hour with the highest combined concurrent players across all
          snapshots. Click any row to see the top games in that combination.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No combos with enough games yet — each genre × age pairing needs at
            least 10 games. More data becomes available after the next snapshot
            refresh.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-right">#</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead>Age rating</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">Player share</TableHead>
                  <TableHead className="text-right">Avg session (min)</TableHead>
                  <TableHead className="text-right">Peak hour</TableHead>
                  <TableHead className="text-right">Adjusted retention</TableHead>
                  <TableHead className="text-right">Raw mean</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const key = `${r.genre}|${r.ageRecommendation}`;
                  const isOpen = expanded === key;
                  return (
                    <>
                      <TableRow
                        key={key}
                        className="cursor-pointer select-none hover:bg-muted/40"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                      >
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {r.genre}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {r.ageRecommendation}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt.format(r.gameCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {pct.format(r.shareOfPlayers)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.meanSessionMinutes === null
                            ? "—"
                            : r.meanSessionMinutes.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtHour(r.peakHourUTC)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-foreground">
                          {r.adjustedRetentionProxy.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.meanRetentionProxy.toFixed(3)}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${key}--drill`} className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={9} className="p-0">
                            <DrillDown games={r.topGames} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
