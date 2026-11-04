import type { Metadata } from "next";
import Link from "next/link";
import { getCachedGenreTrends, getCachedWeekAggregates } from "@/lib/trends/cached";
import { genreBenchmarks, type GenreBenchmark } from "@/lib/trends/genreTrends";
import { genreColor } from "@/lib/trends/genres";
import { fmtDay, fmtInt } from "@/lib/format";
import { niceMax } from "@/lib/stats";
import { LineChart } from "@/components/v2/LineChart";
import { UsdSum } from "@/components/pro/Pro";

export const revalidate = 3600;
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Genre trends: Roblox Pulse",
  description: "Each Roblox genre's share of players week by week, what a typical and a top game looks like in each, and how concentrated the market is.",
};

const DAY_MS = 86_400_000;
// From this day every known game is re-read each refresh, not just that day's discovery lists.
const ALL_GAMES_FROM = Date.UTC(2026, 9, 25);
const WEEK_GAP = 8 * DAY_MS;

const pts = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} pts`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Change({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-medium ${up ? "text-rise" : "text-fall"}`}>
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
        <polygon points={up ? "5,1 9.5,9 0.5,9" : "0.5,1 9.5,1 5,9"} fill="currentColor" />
      </svg>
      {pts(v)}
      <span className="sr-only"> since May</span>
    </span>
  );
}

// The middle half of games as a bar, a tick at the median and a dot where the top 10% begin.
function SessionBar({ b, max }: { b: NonNullable<GenreBenchmark["session"]>; max: number }) {
  const sx = (v: number) => (Math.min(v, max) / max) * 196 + 2;
  return (
    <svg
      width="200"
      height="16"
      viewBox="0 0 200 16"
      role="img"
      aria-label={`Middle half ${b.p25.toFixed(1)} to ${b.p75.toFixed(1)} minutes, median ${b.p50.toFixed(1)}, top 10% from ${b.p90.toFixed(1)}`}
    >
      <rect x="2" y="7" width="196" height="2" rx="1" fill="var(--grid)" />
      <rect x={sx(b.p25)} y="3" width={Math.max(sx(b.p75) - sx(b.p25), 2)} height="10" rx="3" fill="var(--rise)" opacity="0.55" />
      <line x1={sx(b.p50)} x2={sx(b.p50)} y1="1" y2="15" stroke="var(--foreground)" strokeWidth="2" />
      <circle cx={sx(b.p90)} cy="8" r="3.5" fill="var(--rise)" stroke="var(--card)" strokeWidth="1.5" />
    </svg>
  );
}

export default async function GenresPage() {
  const trends = await getCachedGenreTrends();
  if (!trends) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Genre trends</h1>
        <p className="mt-4 text-text-2">Genre trends are temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }
  const aggs = await getCachedWeekAggregates(trends.latestDay);
  const { all, genres } = genreBenchmarks(aggs);

  const top6 = trends.shares.slice(0, 6);
  const yTop = niceMax(Math.max(...top6.flatMap((g) => g.weeks.map((w) => w.share))));
  const weekEnds = top6[0]?.weeks.map((w) => w.endMs) ?? [];
  const xMin = weekEnds[0];
  const xMax = weekEnds[weekEnds.length - 1];
  const latestMs = Date.parse(trends.latestDay);
  const weekFrom = latestMs - 6 * DAY_MS;

  const conc = trends.concentration.weeks;
  const top1Peak = conc.reduce((a, b) => (b.top1 > a.top1 ? b : a), conc[0]);
  const concNow = conc[conc.length - 1];
  const concMax = niceMax(Math.max(...conc.map((w) => w.top10)));

  const sessionMax = Math.ceil(Math.max(...[all, ...genres].map((g) => g.session?.p90 ?? 0)) / 5) * 5;
  const withSession = genres.filter((g) => g.session);
  const longest = [...withSession].sort((a, b) => b.session!.p50 - a.session!.p50)[0];
  const shortest = [...withSession].sort((a, b) => a.session!.p50 - b.session!.p50)[0];
  const smallest = [...genres].sort((a, b) => a.p50 - b.p50)[0];
  const rev = trends.revenue.genres.filter((g) => g.ranked >= 3);
  const playerShare = new Map(trends.shares.map((g) => [g.genre, g.share]));
  const revMax = Math.max(...rev.map((g) => Math.max(g.share, playerShare.get(g.genre) ?? 0)), 0.01);
  const topPerPlayer = rev
    .filter((g) => g.ranked >= 10 && (playerShare.get(g.genre) ?? 0) > 0)
    .map((g) => ({ genre: g.genre, ratio: g.share / playerShare.get(g.genre)! }))
    .sort((a, b) => b.ratio - a.ratio)[0];
  const outlier = (g: GenreBenchmark) => !!(g.session && all.session && g.session.p50 >= 1.5 * all.session.p50);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-9 md:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Genre trends</h1>
        <p className="max-w-2xl text-text-2">
          Each genre&apos;s share of players week by week, what a typical and a top game looks like in each, and how concentrated the market is.
        </p>
      </header>

      <section aria-labelledby="share" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="share" className="font-heading text-2xl font-bold">
            Share of players, top six genres
          </h2>
          <span className="text-[13px] text-muted-foreground">
            All six use the same 0 to {Math.round(yTop.max * 100)}% scale. Change is against May. Dashed line: every known game counted from 25 Oct.
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top6.map((g) => (
            <div key={g.genre} className="flex flex-col gap-1 rounded-2xl border border-border bg-card px-4 pb-2 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-semibold">
                  <span aria-hidden="true" className="inline-block size-2.5 rounded-full" style={{ background: genreColor(g.genre) }} />
                  <Link href={`/explore?launched=any&genre=${encodeURIComponent(g.genre)}`} className="hover:text-link">
                    {g.genre}
                  </Link>
                </h3>
                {g.mayShare !== null ? <Change v={(g.share - g.mayShare) * 100} /> : null}
              </div>
              <div className="font-heading text-3xl font-extrabold tracking-tight">{pct(g.share)}</div>
              <LineChart
                series={[{ id: g.genre, label: g.genre, color: genreColor(g.genre), points: g.weeks.map((w) => [w.endMs, w.share]) }]}
                xKind="date"
                yKind="pct"
                xMin={xMin}
                xMax={xMax}
                yMax={yTop.max}
                yStep={yTop.max / 2}
                width={360}
                height={130}
                endLabels={false}
                maxGap={WEEK_GAP}
                marker={{ x: ALL_GAMES_FROM, label: "" }}
                summary={`${g.genre} share of players by week, from ${pct(g.weeks[0]?.share ?? 0)} in the week to ${fmtDay(xMin)} to ${pct(g.share)} in the week to ${fmtDay(xMax)}.`}
              />
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="conc" className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-6 pb-5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="conc" className="font-heading text-[22px] font-bold">
            How concentrated is the market?
          </h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-2" aria-label="Legend">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-[3px] w-4 rounded bg-text-2" />
              Top 10 games
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-[3px] w-4 rounded bg-rise" />
              Biggest single game
            </li>
          </ul>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <LineChart
              series={[
                { id: "top10", label: "Top 10 games", color: "var(--text-2)", points: conc.map((w) => [w.endMs, w.top10]) },
                { id: "top1", label: "Biggest single game", color: "var(--rise)", points: conc.map((w) => [w.endMs, w.top1]), emphasis: true },
              ]}
              xKind="date"
              yKind="pct"
              xMin={conc[0].endMs}
              xMax={concNow.endMs}
              yMax={concMax.max}
              yStep={concMax.step}
              height={230}
              maxGap={WEEK_GAP}
              marker={{ x: ALL_GAMES_FROM, label: "All known games from 25 Oct" }}
              callout={{ x: top1Peak.endMs, y: top1Peak.top1, text: `${pct(top1Peak.top1)}: ${top1Peak.topName}` }}
              summary={`Share of all tracked players held by the top 10 games and by the single biggest game, week by week. The biggest single game peaked at ${pct(top1Peak.top1)} (${top1Peak.topName}, week to ${fmtDay(top1Peak.endMs)}) and is ${pct(concNow.top1)} now; the top 10 hold ${pct(concNow.top10)}.`}
            />
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Each point is the average over a week of the daily share of all tracked players. From 25 October every known game is counted, not just
          that day&apos;s discovery lists, so the total grew by about a quarter and every share after the dashed line reads lower than before it.
        </p>
      </section>

      {rev.length > 0 ? (
        <section aria-labelledby="revenue" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="revenue" className="font-heading text-2xl font-bold">
              Estimated revenue by genre
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {fmtInt(trends.revenue.genres.reduce((a, g) => a + g.ranked, 0))} games in Roblox&apos;s Top Earning list, {fmtDay(Date.parse(trends.revenue.listDay!))}
            </span>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-2" aria-label="Legend">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-2.5 w-4 rounded-sm bg-gold" />
              Share of estimated revenue
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-2.5 w-4 rounded-sm bg-mark" />
              Share of players
            </li>
          </ul>
          <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="pin w-full min-w-[820px] border-collapse text-sm tabular-nums">
              <thead>
                <tr className="text-right text-xs text-muted-foreground">
                  <th data-pin="" scope="col" className="px-4 py-3 text-left font-medium">Genre</th>
                  <th scope="col" className="px-2 py-3 font-medium">In Top Earning</th>
                  <th scope="col" className="px-2 py-3 font-medium">Est. per month</th>
                  <th scope="col" className="px-2 py-3 text-left font-medium">Revenue vs players, 0 to {Math.round(revMax * 100)}%</th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span title="Share of estimated revenue divided by share of players. Above 1x earns more per player than the market.">Per player vs market</span>
                  </th>
                </tr>
              </thead>
              <tbody className="whitespace-nowrap text-right">
                {rev.map((g) => {
                  const players = playerShare.get(g.genre) ?? 0;
                  const ratio = players > 0 ? g.share / players : null;
                  const bar = (v: number) => `${Math.max((v / revMax) * 100, 0.5)}%`;
                  return (
                    <tr key={g.genre} className="border-t border-rule">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium">
                        <Link href={`/explore?launched=any&earning=1&genre=${encodeURIComponent(g.genre)}&sort=earnings`} className="inline-flex items-center gap-2 hover:text-link">
                          <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: genreColor(g.genre) }} />
                          {g.genre}
                        </Link>
                      </th>
                      <td className="px-2 py-2.5">{fmtInt(g.ranked)}</td>
                      <td className="px-2 py-2.5">
                        <UsdSum ranks={g.ranks} />
                      </td>
                      <td className="w-[300px] px-2 py-2.5 text-left">
                        <div className="flex flex-col gap-[3px]" role="img" aria-label={`${pct(g.share)} of estimated revenue, ${pct(players)} of players`}>
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 rounded-sm bg-gold" style={{ width: bar(g.share) }} />
                            <span className="text-xs text-text-2">{pct(g.share)}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 rounded-sm bg-mark" style={{ width: bar(players) }} />
                            <span className="text-xs text-muted-foreground">{pct(players)}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {ratio === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={ratio >= 1.25 ? "font-semibold text-foreground" : ratio <= 0.8 ? "text-muted-foreground" : ""}>{ratio.toFixed(1)}×</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Revenue is modelled from each game&apos;s Top Earning rank, not measured: Roblox publishes the order of Robux spent, not the
            amounts.{" "}
            <Link href="/methodology#revenue" className="text-link underline">
              How it is estimated
            </Link>
            . Share of players is this week&apos;s, across every tracked game.
            {topPerPlayer ? ` ${topPerPlayer.genre} earns the most per player: about ${topPerPlayer.ratio.toFixed(1)} times its share of players.` : ""}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="bench" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="bench" className="font-heading text-2xl font-bold">
            Benchmarks by genre
          </h2>
          <span className="text-[13px] text-muted-foreground">
            {fmtDay(weekFrom)} to {fmtDay(latestMs)}, games averaging 1,000+ players
          </span>
        </div>
        <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="pin w-full min-w-[880px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th data-pin="" scope="col" rowSpan={2} className="px-4 py-2 text-left align-bottom font-medium">Genre</th>
                <th scope="col" rowSpan={2} className="px-2 py-2 text-right align-bottom font-medium">Games</th>
                <th scope="colgroup" colSpan={3} className="px-2 pt-3 text-center font-medium">Players per game</th>
                <th scope="colgroup" colSpan={2} className="px-4 pt-3 text-center font-medium">Estimated session length</th>
              </tr>
              <tr className="text-right text-xs text-muted-foreground">
                <th scope="col" className="px-2 py-2 font-medium">Median</th>
                <th scope="col" className="px-2 py-2 font-medium">Top 10%</th>
                <th scope="col" className="px-2 py-2 font-medium">Top 1%</th>
                <th scope="col" className="px-2 py-2 font-medium">Median</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Middle half, 0 to {sessionMax} min</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap text-right">
              {[all, ...genres].map((g, i) => (
                <tr key={g.genre} className={`border-t border-rule ${i === 0 ? "bg-surface-2/50 font-medium" : ""}`}>
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    {i === 0 ? (
                      g.genre
                    ) : (
                      <Link href={`/explore?launched=any&min=1000&genre=${encodeURIComponent(g.genre)}`} className="inline-flex items-center gap-2 hover:text-link">
                        <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: genreColor(g.genre) }} />
                        {g.genre}
                      </Link>
                    )}
                  </th>
                  <td className="px-2 py-2.5">{fmtInt(g.n)}</td>
                  <td className="px-2 py-2.5">{fmtInt(g.p50)}</td>
                  <td className="px-2 py-2.5">{fmtInt(g.p90)}</td>
                  <td className="px-2 py-2.5">{g.p99 === null ? <span className="text-muted-foreground">—</span> : fmtInt(g.p99)}</td>
                  <td className="px-2 py-2.5">
                    {g.session ? (
                      <span className="inline-flex items-center gap-2">
                        {i > 0 && outlier(g) ? <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] text-gold">Long</span> : null}
                        {g.session.p50.toFixed(1)} min
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-left">{g.session ? <SessionBar b={g.session} max={sessionMax} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Bar: the middle half of games (25th to 75th percentile), white tick at the median, dot where the top 10% begin. Top 1% is shown only for
          genres with 100+ games. Genres with fewer than 10 games this size are left out.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-heading text-lg font-bold">Takeaways</h3>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-text-2">
              <li>
                A game with about {fmtInt(all.p90)} players is already in the top 10% of games this size; the median has {fmtInt(all.p50)}.
              </li>
              {longest && all.session ? (
                <li>
                  {longest.genre} has the longest sessions, about {Math.round((100 * (longest.session!.p50 - all.session.p50)) / all.session.p50)}% above
                  the overall median ({longest.session!.p50.toFixed(1)} vs {all.session.p50.toFixed(1)} minutes).
                </li>
              ) : null}
              {shortest ? (
                <li>
                  {shortest.genre} has the shortest sessions ({shortest.session!.p50.toFixed(1)} minutes)
                  {smallest && smallest.genre === shortest.genre ? ` and the smallest typical game (${fmtInt(smallest.p50)} players)` : ""}.
                </li>
              ) : null}
            </ul>
          </div>
          <aside aria-label="Note on calculation" className="rounded-2xl border border-border bg-card p-5 text-[13px] text-text-2">
            <h3 className="font-heading text-lg font-bold text-foreground">Note on calculation</h3>
            <p className="mt-2">
              Percentiles are across games, not players: the median is the middle game when all games averaging 1,000+ players this week are lined
              up. Session length is estimated from players and new visits, so it measures something different from in-game session times.{" "}
              <Link href="/methodology" className="text-link underline">
                How we measure
              </Link>
            </p>
          </aside>
        </div>
      </section>

      <section aria-labelledby="week" className="flex flex-col gap-3">
        <h2 id="week" className="font-heading text-2xl font-bold">
          This week, {fmtDay(weekFrom)} to {fmtDay(latestMs)}
        </h2>
        <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[620px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="text-right text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 text-left font-medium">Genre</th>
                <th scope="col" className="px-2 py-3 font-medium">Games tracked</th>
                <th scope="col" className="px-2 py-3 font-medium">Average players</th>
                <th scope="col" className="px-2 py-3 font-medium">Share</th>
                <th scope="col" className="px-4 py-3 font-medium">vs May</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap text-right">
              {trends.shares
                .filter((g) => g.share > 0)
                .map((g) => (
                  <tr key={g.genre} className="border-t border-rule">
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">
                      <Link href={`/explore?launched=any&genre=${encodeURIComponent(g.genre)}`} className="inline-flex items-center gap-2 hover:text-link">
                        <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: genreColor(g.genre) }} />
                        {g.genre}
                      </Link>
                    </th>
                    <td className="px-2 py-2.5">{fmtInt(g.games)}</td>
                    <td className="px-2 py-2.5">{fmtInt(g.players)}</td>
                    <td className="px-2 py-2.5">{pct(g.share)}</td>
                    <td className="px-4 py-2.5">{g.mayShare === null ? "—" : <Change v={(g.share - g.mayShare) * 100} />}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Average players is the sum across the genre&apos;s games of their average concurrent players this week. Games tracked counts every game
          with a reading this week, of any size, so it is larger than the benchmark counts above.
        </p>
      </section>
    </main>
  );
}
