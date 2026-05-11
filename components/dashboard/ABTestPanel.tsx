"use client";

import { useState, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientOnly } from "@/components/dashboard/ClientOnly";
import type { SnapshotGame } from "@/lib/snapshot/schema";
import {
  applyFilter,
  availableGenres,
  availableAgeRatings,
  compareGroups,
  SESSION_BUCKETS,
  type GroupFilter,
  type ComparisonResult,
  type GroupMetrics,
  type MetricDelta,
  type DeviceFilter,
} from "@/lib/snapshot/compare";

// ---- Helpers ---------------------------------------------------------------

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

const fmtNum = {
  dp2: (n: number) => n.toFixed(2),
  dp1: (n: number) => n.toFixed(1),
  pct: (n: number) => `${n.toFixed(1)}%`,
  int: (n: number) => Math.round(n).toLocaleString("en-GB"),
  compact: (n: number) =>
    new Intl.NumberFormat("en-GB", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n),
};

function DeltaCell({ delta }: { delta: MetricDelta }) {
  if (delta.deltaPct === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const sign = delta.deltaPct >= 0 ? "+" : "";
  return (
    <span className={delta.deltaPct >= 0 ? "text-emerald-600" : "text-rose-600"}>
      {sign}
      {delta.deltaPct.toFixed(1)}%
    </span>
  );
}

function WinnerBadge({ winner }: { winner: MetricDelta["winner"] }) {
  if (!winner) return null;
  if (winner === "tie") return <Badge variant="outline">Tie</Badge>;
  if (winner === "A") return <Badge>A</Badge>;
  return <Badge variant="secondary">B</Badge>;
}

// ---- GroupBuilder ----------------------------------------------------------

const DEVICES: DeviceFilter[] = ["Phone", "Tablet", "Desktop", "Console"];

interface GroupBuilderProps {
  label: "A" | "B";
  filter: GroupFilter;
  onChange: (f: GroupFilter) => void;
  genres: string[];
  ageRatings: string[];
  gameCount: number;
}

function GroupBuilder({ label, filter, onChange, genres, ageRatings, gameCount }: GroupBuilderProps) {
  const accentColor = label === "A" ? "var(--primary)" : "var(--chart-2)";

  return (
    <Card className="flex-1 border-l-4" style={{ borderLeftColor: accentColor }}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-background"
            style={{ backgroundColor: accentColor }}
          >
            {label}
          </span>
          Group {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FilterSection label="Genre">
          {filter.genres.length === 0 && (
            <span className="text-xs text-muted-foreground">All genres</span>
          )}
          {genres.map((g) => (
            <Button
              key={g}
              size="sm"
              variant={filter.genres.includes(g) ? "default" : "outline"}
              className="h-6 px-2 text-xs"
              onClick={() => onChange({ ...filter, genres: toggle(filter.genres, g) })}
            >
              {g}
            </Button>
          ))}
        </FilterSection>

        <FilterSection label="Age rating">
          {filter.ageRatings.length === 0 && (
            <span className="text-xs text-muted-foreground">All ratings</span>
          )}
          {ageRatings.map((a) => (
            <Button
              key={a}
              size="sm"
              variant={filter.ageRatings.includes(a) ? "default" : "outline"}
              className="h-6 px-2 text-xs"
              onClick={() => onChange({ ...filter, ageRatings: toggle(filter.ageRatings, a) })}
            >
              {a}
            </Button>
          ))}
        </FilterSection>

        <FilterSection label="Device">
          {filter.devices.length === 0 && (
            <span className="text-xs text-muted-foreground">All devices</span>
          )}
          {DEVICES.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={filter.devices.includes(d) ? "default" : "outline"}
              className="h-6 px-2 text-xs"
              onClick={() => onChange({ ...filter, devices: toggle(filter.devices, d) })}
            >
              {d}
            </Button>
          ))}
        </FilterSection>

        {gameCount === 0 ? (
          <Badge variant="destructive" className="w-fit">
            No games match — adjust filters
          </Badge>
        ) : (
          <Badge variant="secondary" className="w-fit">
            {gameCount.toLocaleString("en-GB")} games match
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// ---- ComparisonSummary -----------------------------------------------------

interface MetricRowSpec {
  label: string;
  aStr: string;
  bStr: string;
  delta: MetricDelta;
}

function ComparisonSummary({ comparison }: { comparison: ComparisonResult }) {
  const { a, b, deltas } = comparison;

  if (a.gameCount === 0 && b.gameCount === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Define both groups above to see the comparison.
        </CardContent>
      </Card>
    );
  }

  const dash = "—";

  const rows: MetricRowSpec[] = [
    {
      label: "Retention proxy (mean)",
      aStr: a.gameCount ? fmtNum.dp2(a.retentionMean) : dash,
      bStr: b.gameCount ? fmtNum.dp2(b.retentionMean) : dash,
      delta: deltas.retentionMean,
    },
    {
      label: "Retention proxy (median)",
      aStr: a.gameCount ? fmtNum.dp2(a.retentionMedian) : dash,
      bStr: b.gameCount ? fmtNum.dp2(b.retentionMedian) : dash,
      delta: deltas.retentionMedian,
    },
    {
      label: "Avg session (min)",
      aStr: a.sessionMean !== null ? fmtNum.dp1(a.sessionMean) : dash,
      bStr: b.sessionMean !== null ? fmtNum.dp1(b.sessionMean) : dash,
      delta: deltas.sessionMean,
    },
    {
      label: "Vote ratio",
      aStr: a.gameCount ? fmtNum.pct(a.voteRatioPct) : dash,
      bStr: b.gameCount ? fmtNum.pct(b.voteRatioPct) : dash,
      delta: deltas.voteRatioPct,
    },
    {
      label: "Concurrent players (median)",
      aStr: a.gameCount ? fmtNum.int(a.concurrentMedian) : dash,
      bStr: b.gameCount ? fmtNum.int(b.concurrentMedian) : dash,
      delta: deltas.concurrentMedian,
    },
    {
      label: "Concurrent players (total)",
      aStr: a.gameCount ? fmtNum.compact(a.concurrentTotal) : dash,
      bStr: b.gameCount ? fmtNum.compact(b.concurrentTotal) : dash,
      delta: deltas.concurrentTotal,
    },
    {
      label: "Favourites (median)",
      aStr: a.gameCount ? fmtNum.compact(a.favoritesMedian) : dash,
      bStr: b.gameCount ? fmtNum.compact(b.favoritesMedian) : dash,
      delta: deltas.favoritesMedian,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Metrics</CardTitle>
        <CardDescription>All figures are proxy estimates — not in-game telemetry.</CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Group A</TableHead>
              <TableHead className="text-right">Group B</TableHead>
              <TableHead className="text-right">Delta</TableHead>
              <TableHead className="text-right">Winner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ label, aStr, bStr, delta }) => (
              <TableRow key={label}>
                <TableCell>{label}</TableCell>
                <TableCell className="text-right tabular-nums">{aStr}</TableCell>
                <TableCell className="text-right tabular-nums">{bStr}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <DeltaCell delta={delta} />
                </TableCell>
                <TableCell className="text-right">
                  <WinnerBadge winner={delta.winner} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---- ComparisonChart -------------------------------------------------------

interface TooltipEntry {
  metric: string;
  rawA: number;
  rawB: number;
  fmtFn: (v: number) => string;
}

function ComparisonTooltip({
  active,
  payload,
  label,
  entries,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
  entries: TooltipEntry[];
}) {
  if (!active || !payload?.length || !label) return null;
  const entry = entries.find((e) => e.metric === label);
  if (!entry) return null;
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">
        Group A:{" "}
        <span className="text-foreground tabular-nums">{entry.fmtFn(entry.rawA)}</span>
      </p>
      <p className="text-muted-foreground">
        Group B:{" "}
        <span className="tabular-nums" style={{ color: "var(--chart-2)" }}>
          {entry.fmtFn(entry.rawB)}
        </span>
      </p>
    </div>
  );
}

function ComparisonChart({ comparison }: { comparison: ComparisonResult }) {
  const { a, b } = comparison;

  const specs: TooltipEntry[] = [
    { metric: "Retention (mean)", rawA: a.retentionMean, rawB: b.retentionMean, fmtFn: fmtNum.dp2 },
    { metric: "Retention (median)", rawA: a.retentionMedian, rawB: b.retentionMedian, fmtFn: fmtNum.dp2 },
    { metric: "Session (min)", rawA: a.sessionMean ?? 0, rawB: b.sessionMean ?? 0, fmtFn: fmtNum.dp1 },
    { metric: "Vote ratio %", rawA: a.voteRatioPct, rawB: b.voteRatioPct, fmtFn: fmtNum.pct },
    { metric: "Concurrent (median)", rawA: a.concurrentMedian, rawB: b.concurrentMedian, fmtFn: fmtNum.int },
  ];

  const chartData = specs.map(({ metric, rawA, rawB }) => {
    const max = Math.max(rawA, rawB);
    return {
      metric,
      A: max === 0 ? 0 : +((rawA / max) * 100).toFixed(1),
      B: max === 0 ? 0 : +((rawB / max) * 100).toFixed(1),
    };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Key metrics (relative score)</CardTitle>
        <CardDescription>
          Bars scaled so the higher group = 100. Hover for raw values.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ClientOnly fallback={<div className="h-72 animate-pulse rounded-md bg-muted/30" />}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 56 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="metric"
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                  height={72}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  width={36}
                  label={{
                    value: "Score (relative)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 12,
                    style: { fill: "var(--muted-foreground)", fontSize: 10 },
                  }}
                />
                <Tooltip
                  content={(props) => (
                    <ComparisonTooltip
                      active={props.active}
                      payload={props.payload as unknown as Array<{ dataKey: string; value: number }>}
                      label={typeof props.label === "string" ? props.label : undefined}
                      entries={specs}
                    />
                  )}
                  cursor={{ fill: "var(--accent)" }}
                />
                <Legend
                  verticalAlign="top"
                  formatter={(value) => (value === "A" ? "Group A" : "Group B")}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="A" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="B" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ClientOnly>
      </CardContent>
    </Card>
  );
}

// ---- SessionDistributionChart ----------------------------------------------

function SessionDistributionChart({ a, b }: { a: GroupMetrics; b: GroupMetrics }) {
  const aHasData = SESSION_BUCKETS.some((bk) => a.sessionBuckets[bk] > 0);
  const bHasData = SESSION_BUCKETS.some((bk) => b.sessionBuckets[bk] > 0);

  const chartData = SESSION_BUCKETS.map((bucket) => ({
    bucket,
    A: +((a.sessionBuckets[bucket] ?? 0) * 100).toFixed(1),
    B: +((b.sessionBuckets[bucket] ?? 0) * 100).toFixed(1),
  }));

  const missingNote =
    !aHasData && !bHasData
      ? "No session data for either group — games need 2+ samples."
      : !aHasData
      ? "No session data for Group A — games need 2+ samples."
      : !bHasData
      ? "No session data for Group B — games need 2+ samples."
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Session length distribution</CardTitle>
        <CardDescription>
          % of games (with 2+ samples) falling into each session-length bucket.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ClientOnly fallback={<div className="h-64 animate-pulse rounded-md bg-muted/30" />}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  width={44}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    `${value}%`,
                    name === "A" ? "Group A" : "Group B",
                  ]}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: 12,
                  }}
                  cursor={{ fill: "var(--accent)" }}
                />
                <Legend
                  verticalAlign="top"
                  formatter={(value) => (value === "A" ? "Group A" : "Group B")}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="A" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="B" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ClientOnly>
        {missingNote && (
          <p className="mt-2 text-xs text-muted-foreground">{missingNote}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---- ABTestPanel -----------------------------------------------------------

export function ABTestPanel({ games }: { games: SnapshotGame[] }) {
  const [filterA, setFilterA] = useState<GroupFilter>({
    genres: [],
    ageRatings: [],
    devices: [],
  });
  const [filterB, setFilterB] = useState<GroupFilter>({
    genres: [],
    ageRatings: [],
    devices: [],
  });

  const genres = useMemo(() => availableGenres(games), [games]);
  const ageRatings = useMemo(() => availableAgeRatings(games), [games]);
  const groupA = useMemo(() => applyFilter(games, filterA), [games, filterA]);
  const groupB = useMemo(() => applyFilter(games, filterB), [games, filterB]);
  const comparison = useMemo(() => compareGroups(groupA, groupB), [groupA, groupB]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row">
        <GroupBuilder
          label="A"
          filter={filterA}
          onChange={setFilterA}
          genres={genres}
          ageRatings={ageRatings}
          gameCount={groupA.length}
        />
        <GroupBuilder
          label="B"
          filter={filterB}
          onChange={setFilterB}
          genres={genres}
          ageRatings={ageRatings}
          gameCount={groupB.length}
        />
      </div>
      <ComparisonSummary comparison={comparison} />
      <ComparisonChart comparison={comparison} />
      <SessionDistributionChart a={comparison.a} b={comparison.b} />
    </div>
  );
}
