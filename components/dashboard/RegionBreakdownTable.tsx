import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RegionRow } from "@/lib/snapshot/aggregate";

const fmt = new Intl.NumberFormat("en-GB");
const fmtCompact = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
});

interface Props {
  rows: RegionRow[];
}

export function RegionBreakdownTable({ rows }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Regional breakdown</CardTitle>
        <CardDescription>
          Roblox promotes the same handful of giants in every market, so the
          drill-down for each non-US region surfaces the games promoted{" "}
          <em>uniquely</em> there — what Roblox is pushing in that country
          that it isn&rsquo;t pushing globally. That&rsquo;s the regional flavour
          signal. The US row is the baseline.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="divide-y divide-border border-y border-border">
          {rows.map((r) => (
            <RegionDetail key={r.country} row={r} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RegionDetail({ row }: { row: RegionRow }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-6 py-3 text-sm transition hover:bg-muted/40">
        <span className="flex w-6 items-center text-muted-foreground transition group-open:rotate-90" aria-hidden>
          &rsaquo;
        </span>
        <div className="flex-1">
          <div className="font-medium text-foreground">
            {row.countryName}{" "}
            <span className="text-xs uppercase text-muted-foreground">{row.country}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Top genre <span className="text-foreground">{row.topGenre}</span>
          </div>
        </div>
        <div className="hidden text-right text-xs text-muted-foreground sm:block">
          <div>
            <span className="tabular-nums text-foreground">{fmt.format(row.gameCount)}</span> games
          </div>
          <div>
            <span className="tabular-nums text-foreground">{fmtCompact.format(row.totalPlaying)}</span> concurrent
          </div>
        </div>
        <div className="hidden text-right text-xs text-muted-foreground md:block">
          <div className="tabular-nums text-foreground">{row.meanRetentionProxy.toFixed(3)}</div>
          <div>avg retention</div>
        </div>
      </summary>
      <div className="grid grid-cols-1 gap-6 bg-muted/20 px-6 py-5 md:grid-cols-3">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {row.isBaseline ? "Top games here" : "Unique to this region"}
          </h4>
          {row.isBaseline ? (
            <GameList games={row.topGames} />
          ) : row.uniqueToRegion.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Same lineup as the US baseline — Roblox isn&rsquo;t promoting
              anything here that it isn&rsquo;t already pushing globally.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                Promoted in {row.countryName} but not in the US baseline. The
                regional flavour signal.
              </p>
              <GameList games={row.uniqueToRegion} />
            </>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Genre mix
          </h4>
          <ul className="space-y-1.5 text-sm">
            {row.topGenres.map((g) => (
              <li key={g.genre} className="flex items-baseline justify-between gap-3">
                <span className="text-foreground">{g.genre}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {g.gameCount} ({g.sharePct.toFixed(0)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Age-rating mix
          </h4>
          <ul className="space-y-1.5 text-sm">
            {row.ageMix.map((a) => (
              <li key={a.ageRecommendation} className="flex items-baseline justify-between gap-3">
                <Badge variant="secondary" className="font-normal">{a.ageRecommendation}</Badge>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {a.gameCount} ({a.sharePct.toFixed(0)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

function GameList({ games }: { games: RegionRow["topGames"] }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {games.map((g) => (
        <li key={g.universeId} className="flex items-baseline justify-between gap-3">
          <a
            href={`https://www.roblox.com${g.canonicalUrlPath}`}
            target="_blank"
            rel="noreferrer"
            className="truncate font-medium text-foreground hover:underline"
            title={`${g.name} — ${g.creatorName}`}
          >
            {g.name}
          </a>
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
            {fmtCompact.format(g.playing)}
          </span>
        </li>
      ))}
    </ol>
  );
}
