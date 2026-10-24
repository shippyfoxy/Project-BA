import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getSiteDb } from "@/lib/db/site";
import { getCachedWeekAggregates } from "@/lib/trends/cached";
import { getGameHistory, type GameHistory } from "@/lib/trends/game";
import { genreStyle } from "@/lib/trends/genres";
import { displayName } from "@/lib/trends/names";
import { getGameIcons, getGameScreenshots } from "@/lib/roblox/thumbnails";
import { fmtCompact, fmtDay, fmtInt, fmtPct, fmtTimeUtc, fmtWeekdayDay } from "@/lib/format";
import { niceMax } from "@/lib/stats";
import { GameIcon } from "@/components/v2/GameIcon";
import { StageBadge } from "@/components/v2/StageBadge";
import { PlayersChart } from "@/components/v2/PlayersChart";
import { BenchmarkScale, LikeRatioChart, NewVisitsChart, WeeklyCompare } from "@/components/v2/GameCharts";

export const revalidate = 3600;
export const maxDuration = 30;

// None are pre-built: each game page is rendered on its first visit, then
// cached and regenerated at most hourly.
export function generateStaticParams() {
  return [];
}

const loadGame = cache(async (id: number): Promise<GameHistory | null> => {
  const db = getSiteDb();
  if (!db) return null;
  return getGameHistory(db, id, { loadAggregates: getCachedWeekAggregates });
});

function parseId(raw: string): number | null {
  if (!/^\d{1,20}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = parseId((await params).id);
  const g = id ? await loadGame(id) : null;
  if (!g) return { title: "Game not found: Roblox Pulse" };
  const name = displayName(g.name);
  return {
    title: `${name}: player history on Roblox Pulse`,
    description: `Daily concurrent players, visits and genre benchmarks for ${name} on Roblox, tracked since ${fmtDay(g.daily[0].dayMs)}.`,
  };
}

const DEVICE_LABELS: Record<string, string> = {
  computer: "Computer",
  high_end_phone: "Phone",
  low_end_phone: "Entry-level phone",
  high_end_tablet: "Tablet",
  low_end_tablet: "Entry-level tablet",
  console: "Console",
  vr: "VR",
};

const ordinal = (n: number) => {
  const r = Math.round(n);
  const s = r % 100 >= 11 && r % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[r % 10] ?? "th";
  return `${r}${s}`;
};

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex-[1_1_220px] rounded-2xl border border-border bg-card px-5 py-4">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-[34px] font-extrabold tracking-tight">{value}</div>
      <div className="text-[13px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function takeaways(g: GameHistory, genreLabel: string): string[] {
  const out: string[] = [];
  const b = g.bench;
  if (b?.players && b.players.topPct !== undefined && b.players.topPct <= 5) {
    const t = b.players.topPct < 1 ? b.players.topPct.toFixed(1) : String(Math.max(1, Math.round(b.players.topPct)));
    out.push(`Top ${t}% of ${b.players.n} ${genreLabel} games for players this week.`);
  }
  if (b?.session) {
    const diff = b.session.value / b.session.p50 - 1;
    if (Math.abs(diff) >= 0.15) {
      out.push(
        `Sessions run about ${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? "longer" : "shorter"} than the typical ${genreLabel} game (${b.session.value.toFixed(1)} vs ${b.session.p50.toFixed(1)} minutes, estimated).`,
      );
    }
  }
  const sat = g.rhythm?.find((r) => r.dow === 6);
  if (sat && Math.abs(sat.game - sat.all) >= 15) {
    out.push(
      `${sat.game > sat.all ? "More" : "Less"} weekend-driven than Roblox overall: Saturdays run at ${Math.round(sat.game)}% of its weekly average, against ${Math.round(sat.all)}%.`,
    );
  }
  if (b?.favourites && b.favourites.percentile !== undefined) {
    if (b.favourites.percentile < 25 || b.favourites.percentile > 75) {
      out.push(
        `${b.favourites.percentile < 25 ? "Fewer" : "More"} favourites per visit than most games its size (${b.favourites.value.toFixed(2)} per 1,000 visits, against a median of ${b.favourites.p50.toFixed(2)}).`,
      );
    }
  }
  if (g.cur7 !== null && g.cur7 < g.peak7 * 0.95) {
    out.push(`At ${Math.round((100 * g.cur7) / g.peak7)}% of its best 7-day average, set in the week to ${fmtDay(g.peak7DayMs)}.`);
  }
  return out.slice(0, 4);
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const g = await loadGame(id);
  if (!g) notFound();

  const [icons, shots] = await Promise.all([getGameIcons([g.universeId]), getGameScreenshots(g.universeId)]);
  const name = displayName(g.name);
  const genre = genreStyle(g.genre);
  const robloxHref = g.canonicalUrlPath ? `https://www.roblox.com${g.canonicalUrlPath}` : null;
  const first = g.daily[0];
  const last = g.daily[g.daily.length - 1];
  const peakPoint = g.daily.find((d) => d.dayMs === g.peak7DayMs) ?? last;
  const visits = g.daily.filter((d) => d.newVisits !== null).map((d) => ({ dayMs: d.dayMs, v: d.newVisits! }));
  const likes = g.daily
    .filter((d) => d.upVotes !== null && d.downVotes !== null && d.upVotes + d.downVotes > 0)
    .map((d) => ({ dayMs: d.dayMs, ratio: d.upVotes! / (d.upVotes! + d.downVotes!) }));
  const notes = takeaways(g, genre.short);
  const sat = g.rhythm?.find((r) => r.dow === 6);
  const b = g.bench;

  const playersMax = b?.players ? 10 ** Math.ceil(Math.log10(Math.max(b.players.value, b.players.p99 ?? b.players.p90) * 1.2)) : 0;
  const sessionMax = b?.session ? Math.max(30, Math.ceil(Math.max(b.session.value, b.session.p90) / 5) * 5) : 0;
  const favMax = b?.favourites ? niceMax(Math.max(b.favourites.value, b.favourites.p90) * 1.1).max : 0;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-7 px-4 pb-16 pt-6 md:px-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-[13px] text-muted-foreground">
        <Link href="/" className="text-text-2 hover:text-foreground">
          Trends
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/explore?q=${encodeURIComponent(g.genre)}`} className="text-text-2 hover:text-foreground">
          {g.genre}
        </Link>
        <span aria-hidden="true">/</span>
        <span>{name}</span>
      </nav>

      <section className={`relative flex items-end overflow-hidden rounded-3xl border border-border ${shots.length ? "min-h-[380px]" : "bg-card"}`}>
        {shots[0] ? (
          <>
            <Image src={shots[0]} alt={`${name} screenshot`} fill unoptimized priority className="object-cover" sizes="100vw" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,13,16,0)_30%,rgba(11,13,16,0.92)_85%)]" />
          </>
        ) : null}
        <div className="relative flex w-full flex-wrap items-end justify-between gap-5 p-6 md:p-7">
          <div className="flex min-w-0 flex-wrap items-end gap-4">
            <GameIcon url={icons.get(g.universeId)} name={name} size={104} ring="#0b0d10" />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {g.stage ? <StageBadge stage={g.stage} /> : null}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(11,13,16,0.75)] px-2.5 py-0.5 text-xs font-medium" style={{ boxShadow: `inset 0 0 0 1px ${genre.color}99` }}>
                  <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: genre.color }} />
                  {g.genre}
                  {g.genreL2 ? ` › ${g.genreL2}` : ""}
                </span>
                {g.rank !== null && g.rank <= 10 ? (
                  <span className="inline-flex items-center rounded-full bg-[rgba(11,13,16,0.75)] px-2.5 py-0.5 text-xs font-medium shadow-[inset_0_0_0_1px_var(--input)]">
                    #{g.rank} most played
                  </span>
                ) : null}
              </div>
              <h1 className="font-heading text-4xl font-extrabold leading-none tracking-[-0.03em] md:text-[56px]">{name}</h1>
              <p className="text-sm text-[#d4d9e1]">
                by {g.creatorName}
                {g.createdMs ? ` · Created ${fmtDay(g.createdMs)} ${new Date(g.createdMs).getUTCFullYear()}` : ""}
                {g.ageRecommendation ? ` · ${g.ageRecommendation}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {robloxHref ? (
              <a href={robloxHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-xl bg-[rgba(11,13,16,0.8)] px-4 text-sm font-medium shadow-[inset_0_0_0_1px_#3a4250] hover:bg-secondary">
                Open on Roblox<span className="sr-only"> (opens Roblox)</span>
              </a>
            ) : null}
            <a href={`/api/v1/games/${g.universeId}/history`} className="inline-flex h-11 items-center rounded-xl bg-rise px-4 text-sm font-bold text-background hover:brightness-110">
              Get the data
            </a>
          </div>
        </div>
      </section>

      {shots.length > 1 ? (
        <div className="hidden flex-wrap gap-3 sm:flex">
          {shots.map((s, i) => (
            <div key={s} className="relative aspect-video min-w-0 flex-[1_1_240px] overflow-hidden rounded-2xl border border-border">
              <Image src={s} alt={`${name} screenshot ${i + 1}`} fill unoptimized className="object-cover" sizes="(min-width: 768px) 33vw, 100vw" />
            </div>
          ))}
        </div>
      ) : null}

      <section aria-label="Key figures" className="flex flex-wrap gap-3">
        <Tile label="Peak 7-day average" value={fmtCompact(g.peak7)} hint={`week to ${fmtDay(g.peak7DayMs)}`} />
        {g.cur7 !== null ? (
          <Tile
            label="Now"
            value={`${Math.round((100 * g.cur7) / g.peak7)}% of peak`}
            hint={`7-day average ${fmtCompact(g.cur7)}${g.wowPct !== null ? `, ${fmtPct(g.wowPct)} on last week` : ""}`}
          />
        ) : (
          <Tile label="Now" value="Not seen this week" hint={`last tracked ${fmtDay(last.dayMs)}`} />
        )}
        {g.daysToMillion !== null ? (
          <Tile label="Creation to 1M" value={`${g.daysToMillion} days`} hint="to a 1M 7-day average" />
        ) : g.rank !== null ? (
          <Tile label="Rank this week" value={`#${fmtInt(g.rank)}`} hint="by 7-day average players" />
        ) : (
          <Tile label="Tracked for" value={`${g.daily.length} days`} hint={`since ${fmtDay(first.dayMs)}`} />
        )}
        <Tile label="Highest single reading" value={fmtCompact(g.highest.players)} hint={`${fmtWeekdayDay(g.highest.atMs)}, ${fmtTimeUtc(g.highest.atMs)}`} />
      </section>

      <section aria-labelledby="players" className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-6 pb-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="players" className="font-heading text-[22px] font-bold">
            Concurrent players, {fmtDay(first.dayMs)} to {fmtDay(last.dayMs)}
          </h2>
          <div className="flex flex-wrap gap-4 text-[13px] text-text-2">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-[3px] w-5 rounded bg-rise" />7-day average
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-[2px] w-5 rounded bg-[#6b7484]" />Daily average
            </span>
          </div>
        </div>
        {g.daily.length >= 2 ? (
          <div className="overflow-x-auto"><div className="min-w-[620px]"><PlayersChart
            points={g.daily.map((d) => ({ dayMs: d.dayMs, avg: d.avg, r7: d.r7 }))}
            peak={{ dayMs: peakPoint.dayMs, avg: peakPoint.avg, r7: peakPoint.r7 }}
            summary={`Concurrent players for ${name} from ${fmtDay(first.dayMs)} to ${fmtDay(last.dayMs)}. 7-day average peaked at ${fmtCompact(g.peak7)} in the week to ${fmtDay(g.peak7DayMs)}${g.cur7 !== null ? ` and is ${fmtCompact(g.cur7)} now` : ""}. Use the arrow keys to step through days.`}
          /></div></div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Only one day of data so far.</p>
        )}
        <p className="text-[13px] text-muted-foreground">
          Daily average of each day&apos;s readings. Days are placed by date, so gaps show where the game was not in Roblox&apos;s
          discovery lists. Hover or use the arrow keys for exact numbers.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-link">Show the daily numbers</summary>
          <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] border-collapse tabular-nums">
              <thead className="sticky top-0 bg-card">
                <tr className="text-right text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Day</th>
                  <th scope="col" className="px-3 py-2 font-medium">Daily average</th>
                  <th scope="col" className="px-3 py-2 font-medium">7-day average</th>
                  <th scope="col" className="px-3 py-2 font-medium">Highest</th>
                  <th scope="col" className="px-3 py-2 font-medium">New visits</th>
                  <th scope="col" className="px-3 py-2 font-medium">Readings</th>
                </tr>
              </thead>
              <tbody className="text-right">
                {[...g.daily].reverse().map((d) => (
                  <tr key={d.dayMs} className="border-t border-[#1b2028]">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">{fmtDay(d.dayMs)}</th>
                    <td className="px-3 py-1.5">{fmtInt(d.avg)}</td>
                    <td className="px-3 py-1.5">{fmtInt(d.r7)}</td>
                    <td className="px-3 py-1.5">{fmtInt(d.max)}</td>
                    <td className="px-3 py-1.5">{d.newVisits === null ? "—" : fmtInt(d.newVisits)}</td>
                    <td className="px-3 py-1.5">{d.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section aria-labelledby="bench" className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="bench" className="font-heading text-[22px] font-bold">
            How it compares
          </h2>
          <span className="text-[13px] text-muted-foreground">This week, against other {g.genre} games with 1,000+ players</span>
        </div>
        {!b ? (
          <p className="text-sm text-text-2">Benchmarks need a 7-day average of at least 1,000 players this week.</p>
        ) : (
          <>
            {b.players ? (
              <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b border-[#1b2028] pb-4">
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                  <span className="text-[13px] text-muted-foreground">Players, 7-day average</span>
                  <span className="flex flex-wrap items-baseline gap-2.5">
                    <span className="font-heading text-[28px] font-extrabold">{fmtInt(b.players.value)}</span>
                    {b.players.p99 !== undefined && b.players.value > b.players.p99 ? (
                      <span className="rounded-full bg-[rgba(229,177,58,0.16)] px-2.5 py-0.5 text-xs font-bold">Outlier</span>
                    ) : null}
                  </span>
                  <span className="text-[13px] text-text-2">
                    Top {b.players.topPct! < 1 ? b.players.topPct!.toFixed(1) : Math.max(1, Math.round(b.players.topPct!))}% of {b.players.n} {g.genre} games
                  </span>
                </div>
                <BenchmarkScale
                  value={b.players.value}
                  valueLabel={fmtCompact(b.players.value)}
                  min={1000}
                  max={playersMax}
                  log
                  minLabel="1k · log scale"
                  maxLabel={fmtCompact(playersMax)}
                  marks={[
                    { value: b.players.p50, label: `median ${fmtCompact(b.players.p50)}`, strong: true },
                    { value: b.players.p90, label: `top 10% ${fmtCompact(b.players.p90)}` },
                    ...(b.players.p99 !== undefined ? [{ value: b.players.p99, label: `top 1% ${fmtCompact(b.players.p99)}` }] : []),
                  ]}
                  label={`Players on a log scale: the median ${g.genre} game has ${fmtInt(b.players.p50)}, the top 10% start at ${fmtInt(b.players.p90)}. ${name} has ${fmtInt(b.players.value)}.`}
                />
              </div>
            ) : (
              <p className="border-b border-[#1b2028] pb-4 text-sm text-text-2">
                Too few {g.genre} games this week (under 15) for a player benchmark.
              </p>
            )}
            {b.session ? (
              <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b border-[#1b2028] pb-4">
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                  <span className="text-[13px] text-muted-foreground">Estimated session length</span>
                  <span className="font-heading text-[28px] font-extrabold">{b.session.value.toFixed(1)} min</span>
                  <span className="text-[13px] text-text-2">
                    {ordinal(b.session.percentile!)} percentile of {b.session.n} {g.genre} games
                  </span>
                </div>
                <BenchmarkScale
                  value={b.session.value}
                  valueLabel={`${b.session.value.toFixed(1)} min`}
                  min={0}
                  max={sessionMax}
                  band={[b.session.p25!, b.session.p75!]}
                  minLabel="0 min"
                  maxLabel={`${sessionMax} min`}
                  marks={[
                    { value: b.session.p50, label: `median ${b.session.p50.toFixed(1)}`, strong: true },
                    { value: b.session.p90, label: `top 10% ${b.session.p90.toFixed(1)}` },
                  ]}
                  label={`Session length: the middle half of ${g.genre} games run ${b.session.p25!.toFixed(1)} to ${b.session.p75!.toFixed(1)} minutes, median ${b.session.p50.toFixed(1)}. ${name} is at ${b.session.value.toFixed(1)}.`}
                />
              </div>
            ) : null}
            {b.favourites ? (
              <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                  <span className="text-[13px] text-muted-foreground">Favourites per 1,000 visits</span>
                  <span className="font-heading text-[28px] font-extrabold">{b.favourites.value.toFixed(2)}</span>
                  <span className="text-[13px] text-text-2">
                    {b.favourites.value >= b.favourites.p50 ? "Above" : "Below"} the median of the {b.favourites.n} games with {b.favourites.cohort}
                  </span>
                </div>
                <BenchmarkScale
                  value={b.favourites.value}
                  valueLabel={b.favourites.value.toFixed(2)}
                  min={0}
                  max={favMax}
                  minLabel="0"
                  maxLabel={String(favMax)}
                  marks={[
                    { value: b.favourites.p25!, label: b.favourites.p25!.toFixed(2) },
                    { value: b.favourites.p50, label: `median ${b.favourites.p50.toFixed(2)}`, strong: true },
                    { value: b.favourites.p90, label: `top 10% ${b.favourites.p90.toFixed(2)}` },
                  ]}
                  label={`Favourites per 1,000 visits among games with ${b.favourites.cohort}: lower quarter from ${b.favourites.p25!.toFixed(2)}, median ${b.favourites.p50.toFixed(2)}, top 10% from ${b.favourites.p90.toFixed(2)}. ${name} is at ${b.favourites.value.toFixed(2)}.`}
                />
              </div>
            ) : null}
            <aside aria-label="Note on calculation" className="flex flex-col gap-1.5 rounded-xl border border-dashed border-input px-4 py-3.5 text-[13px] text-text-2">
              <strong className="text-sm text-foreground">Note on calculation</strong>
              <span>
                Estimated session length is players divided by new visits per minute over the last week, so it is an
                estimate from public counters, not measured play time. GameAnalytics&apos;{" "}
                <a href="https://www.gameanalytics.com/reports/2026-roblox-report" className="text-link underline">
                  2026 Roblox report
                </a>{" "}
                puts the median Roblox session at 9.8 minutes, measured inside games; treat the two as different measures.
              </span>
              <span>Favourites are compared with games of similar lifetime visits, because favourites per visit fall as visits pile up.</span>
            </aside>
          </>
        )}
      </section>

      {g.rhythm || g.reach ? (
        <div className="flex flex-wrap gap-4">
          {g.rhythm ? (
            <section aria-labelledby="week" className="flex min-w-0 flex-[3_1_520px] flex-col gap-3 rounded-2xl border border-border bg-card px-6 pb-4 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="week" className="font-heading text-[22px] font-bold">
                  {sat && sat.game >= 140 ? "A Saturday game" : "Weekly rhythm"}
                </h2>
                <div className="flex flex-wrap gap-4 text-[13px] text-text-2">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="inline-block size-3 rounded-[3px] bg-rise" />
                    {name}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="inline-block size-3 rounded-[3px] bg-[#5c6573]" />
                    All tracked games
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto"><div className="min-w-[460px]"><WeeklyCompare rhythm={g.rhythm} name={name} /></div></div>
              <p className="text-sm text-text-2">
                Average players for each weekday over the last 20 weeks, as % of the weekly average.
                {sat ? ` Saturdays run at ${Math.round(sat.game)}%, against ${Math.round(sat.all)}% for all tracked games.` : ""}
              </p>
            </section>
          ) : null}
          {g.reach ? (
            <section aria-labelledby="reach" className="flex min-w-0 flex-[2_1_320px] flex-col gap-3 rounded-2xl border border-border bg-card px-6 py-5">
              <h2 id="reach" className="font-heading text-[22px] font-bold">
                Discovery reach
              </h2>
              <p className="text-sm text-text-2">
                In {g.reach.countries.length} of the {g.reach.totalCountries} country lists and {g.reach.devices.length} of the{" "}
                {g.reach.totalDevices} device lists we sample, on {fmtDay(g.asOfMs)}.
              </p>
              <ul className="flex flex-wrap gap-1.5 font-mono text-xs" aria-label="Countries">
                {g.reach.countries.map((c) => (
                  <li key={c} className="rounded-lg bg-[rgba(74,139,232,0.16)] px-2 py-1 uppercase">
                    {c}
                  </li>
                ))}
              </ul>
              <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Devices">
                {g.reach.devices.map((d) => (
                  <li key={d} className="rounded-full border border-input px-2.5 py-1">
                    {DEVICE_LABELS[d] ?? d}
                  </li>
                ))}
              </ul>
              <p className="text-[13px] text-muted-foreground">
                {fmtInt(g.reach.inAll)} games were in every country list that day; {fmtInt(g.reach.inOne)} were in just one.
              </p>
            </section>
          ) : null}
        </div>
      ) : null}

      {visits.length >= 2 || likes.length >= 2 ? (
        <div className="flex flex-wrap gap-4">
          {visits.length >= 2 ? (
            <section aria-labelledby="visits" className="flex min-w-0 flex-[1_1_460px] flex-col gap-3 rounded-2xl border border-border bg-card px-6 pb-4 pt-5">
              <h2 id="visits" className="font-heading text-xl font-bold">
                New visits per day
              </h2>
              <div className="overflow-x-auto"><div className="min-w-[520px]"><NewVisitsChart points={visits} label={`New visits per day for ${name}, peaking at ${fmtCompact(Math.max(...visits.map((v) => v.v)))}.`} /></div></div>
              <p className="text-[13px] text-muted-foreground">
                Change in lifetime visits between days with data. Lifetime total: {fmtInt(g.latest.visits)}.
              </p>
            </section>
          ) : null}
          {likes.length >= 2 ? (
            <section aria-labelledby="likes" className="flex min-w-0 flex-[1_1_460px] flex-col gap-3 rounded-2xl border border-border bg-card px-6 pb-4 pt-5">
              <h2 id="likes" className="font-heading text-xl font-bold">
                Like ratio
              </h2>
              <div className="overflow-x-auto"><div className="min-w-[520px]"><LikeRatioChart points={likes} label={`Share of upvotes for ${name}, now ${(likes[likes.length - 1].ratio * 100).toFixed(1)}%.`} /></div></div>
              <p className="text-[13px] text-muted-foreground">
                Upvotes as a share of all votes
                {g.latest.upVotes !== null && g.latest.downVotes !== null
                  ? `: ${fmtInt(g.latest.upVotes)} up, ${fmtInt(g.latest.downVotes)} down.`
                  : "."}
              </p>
            </section>
          ) : null}
        </div>
      ) : null}

      {notes.length > 0 ? (
        <section aria-labelledby="takeaways" className="flex flex-col gap-3 rounded-2xl border border-[rgba(74,139,232,0.35)] bg-[rgba(74,139,232,0.08)] px-6 py-5">
          <h2 id="takeaways" className="font-heading text-[22px] font-bold">
            Takeaways
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[#d4d9e1]">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="facts" className="rounded-2xl border border-border bg-card px-6 py-5">
        <h2 id="facts" className="mb-3 text-base font-semibold">
          Details
        </h2>
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm md:grid-cols-[repeat(4,minmax(0,1fr))]">
          <dt className="text-muted-foreground">Lifetime visits</dt>
          <dd className="tabular-nums">{fmtInt(g.latest.visits)}</dd>
          <dt className="text-muted-foreground">Favourites</dt>
          <dd className="tabular-nums">{g.latest.favorites === null ? "—" : fmtInt(g.latest.favorites)}</dd>
          <dt className="text-muted-foreground">First seen in discovery</dt>
          <dd>
            {fmtDay(g.firstSeenMs)} {new Date(g.firstSeenMs).getUTCFullYear()}, {fmtTimeUtc(g.firstSeenMs)}
          </dd>
          <dt className="text-muted-foreground">Days tracked</dt>
          <dd className="tabular-nums">{g.daily.length}</dd>
          <dt className="text-muted-foreground">Universe ID</dt>
          <dd className="font-mono">{g.universeId}</dd>
          <dt className="text-muted-foreground">Root place ID</dt>
          <dd className="font-mono">{g.rootPlaceId}</dd>
        </dl>
      </section>
    </main>
  );
}
