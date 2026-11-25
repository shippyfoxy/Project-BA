import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getSiteDb } from "@/lib/db/site";
import {
  getCachedGenreTrends,
  getCachedIdeas,
  getCachedLaunchCurves,
  getCachedRevenuePage,
  getCachedUpdateImpact,
  getCachedWeekAggregates,
} from "@/lib/trends/cached";
import { genreBenchmarks } from "@/lib/trends/genreTrends";
import { genreColor } from "@/lib/trends/genres";
import { Q } from "@/lib/trends/launches";
import { DEFAULT_FILTERS, screenGames } from "@/lib/trends/screener";
import { displayName } from "@/lib/trends/names";
import { fmtCompact, fmtDay, fmtInt } from "@/lib/format";
import { niceMax } from "@/lib/stats";
import { LineChart } from "@/components/v2/LineChart";
import { StageBadge } from "@/components/v2/StageBadge";
import { HitBar, MomentumChip, pts, SubgenreTable } from "@/components/v2/IdeaBits";
import { Usd, UsdSum } from "@/components/pro/Pro";

export const revalidate = 3600;
export const maxDuration = 60;

// None are pre-built: each genre page is rendered on its first visit, then
// cached and regenerated at most hourly, like game pages.
export function generateStaticParams() {
  return [];
}

const DAY_MS = 86_400_000;
const ALL_GAMES_FROM = Date.UTC(2026, 9, 25);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}%`;

const loadGenre = cache(async (raw: string) => {
  let genre = raw;
  try {
    genre = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const trends = await getCachedGenreTrends();
  const share = trends?.shares.find((g) => g.genre === genre);
  return trends && share && genre !== "Other" ? { genre, trends, share } : null;
});

export async function generateMetadata({ params }: { params: Promise<{ genre: string }> }): Promise<Metadata> {
  const g = await loadGenre((await params).genre);
  if (!g) return { title: "Genre not found: Roblox Pulse" };
  return {
    title: `${g.genre} on Roblox: players, subgenres and revenue · Roblox Pulse`,
    description: `How ${g.genre} games are doing on Roblox: players and share over time, subgenres, top and rising games, revenue, launch benchmarks and what follows an update.`,
  };
}

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint: ReactNode }) {
  return (
    <div className="flex-[1_1_150px] rounded-2xl border border-border bg-card px-5 py-4 sm:flex-[1_1_200px]">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-[24px] font-extrabold tracking-tight sm:text-[30px]">{value}</div>
      <div className="text-[13px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function Section({ id, title, more, children }: { id: string; title: string; more?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-heading text-[26px] font-bold tracking-[-0.02em]">
          {title}
        </h2>
        {more ? <span className="text-sm">{more}</span> : null}
      </div>
      {children}
    </section>
  );
}

export default async function GenrePage({ params }: { params: Promise<{ genre: string }> }) {
  const loaded = await loadGenre((await params).genre);
  if (!loaded) notFound();
  const { genre, trends, share } = loaded;
  const db = getSiteDb();
  const any = { ...DEFAULT_FILTERS, launched: "any" as const, genres: [genre] };

  const [aggs, ideas, curves, allCurves, impact, revenue, top, risers] = await Promise.all([
    getCachedWeekAggregates(trends.latestDay),
    getCachedIdeas(genre).catch(() => null),
    getCachedLaunchCurves(genre).catch(() => null),
    getCachedLaunchCurves(null).catch(() => null),
    getCachedUpdateImpact().catch(() => null),
    getCachedRevenuePage().catch(() => null),
    db ? screenGames(db, { ...any, limit: 10 }).catch(() => null) : null,
    db ? screenGames(db, { ...any, min: 1_000, sort: "wow" }).catch(() => null) : null,
  ]);

  const color = genreColor(genre);
  const bench = genreBenchmarks(aggs);
  const b = bench.genres.find((g) => g.genre === genre) ?? null;
  const idea = ideas?.genres.find((g) => g.genre === genre) ?? null;
  const subgenres = ideas?.subgenres.filter((s) => s.parent === genre) ?? [];
  const patterns = [...(ideas?.patterns ?? [])].sort((a, b) => b.players - a.players).slice(0, 8);
  const rev = trends.revenue.genres.find((g) => g.genre === genre) ?? null;
  const earners = (revenue?.games ?? []).filter((g) => g.genre === genre).slice(0, 8);
  const topGames = top?.matches.slice(0, 10) ?? [];
  const rising = (risers?.matches ?? []).filter((g) => g.wowPct !== null && g.wowPct > 0).slice(0, 5);
  const ann = impact?.byGenre.find((g) => g.genre === genre) ?? null;
  const day = (c: typeof curves, n: number) => c?.days.find((d) => d.day === n) ?? null;
  const d7 = day(curves, 7);
  const d30 = day(curves, 30);
  const all7 = day(allCurves, 7);

  // Share by month. Before 25 October only games in the discovery lists were
  // read, which shifted shares when every game started being counted, so
  // months on either side of that date are not compared with each other.
  const byMonth = new Map<string, { label: string; shares: number[]; fromMs: number }>();
  for (const w of share.weeks) {
    const d = new Date(w.endMs);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const m = byMonth.get(key) ?? { label: MONTHS[d.getUTCMonth()], shares: [], fromMs: w.endMs };
    m.shares.push(w.share);
    byMonth.set(key, m);
  }
  const months = [...byMonth.values()].map((m) => ({ ...m, share: m.shares.reduce((a, b) => a + b, 0) / m.shares.length }));
  const monthMax = Math.max(...months.map((m) => m.share), 0.0001);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const inRange = (from: string, to: string) =>
    mean(share.weeks.filter((w) => w.endMs >= Date.parse(from) && w.endMs <= Date.parse(to)).map((w) => w.share));
  const summer = inRange("2026-06-01", "2026-08-31");
  const autumn = inRange("2026-09-01", "2026-10-23");

  // Takeaways: only from figures on this page, each with enough behind it.
  const notes: string[] = [];
  if (idea?.vsMarket !== null && idea?.vsMarket !== undefined && Math.abs(idea.vsMarket) >= 0.03) {
    notes.push(`Players ${idea.vsMarket > 0 ? "ahead of" : "behind"} the market this week by ${pts(Math.abs(idea.vsMarket)).replace("+", "")}.`);
  }
  if (summer !== null && autumn !== null && Math.abs(autumn - summer) >= 0.003) {
    notes.push(`Its share of players ${autumn > summer ? "grew" : "fell"} from ${pct1(summer)} in summer (June to August) to ${pct1(autumn)} in September and October.`);
  }
  if (rev && rev.ranked >= 5 && share.share > 0) {
    const ratio = rev.share / share.share;
    notes.push(
      ratio >= 1.2
        ? `Earns ${ratio.toFixed(1)} times its share of players: ${pct1(rev.share)} of estimated revenue from ${pct1(share.share)} of players.`
        : ratio <= 0.8
          ? `Earns less than its share of players: ${pct1(rev.share)} of estimated revenue from ${pct1(share.share)} of players.`
          : `Earns about its share of players (${pct1(rev.share)} of estimated revenue, ${pct1(share.share)} of players).`,
    );
  }
  const risingSubs = subgenres.filter((s) => s.momentum === "rising").map((s) => s.genre);
  const crowdedSubs = subgenres.filter((s) => s.momentum === "crowding").map((s) => s.genre);
  if (risingSubs.length) notes.push(`Rising subgenre${risingSubs.length > 1 ? "s" : ""}: ${risingSubs.join(", ")}.`);
  if (crowdedSubs.length) notes.push(`Studios are piling into ${crowdedSubs.join(", ")}.`);
  if (d7 && all7 && d7.games >= 30) {
    const ratio = d7.q[Q.p50] / Math.max(all7.q[Q.p50], 1);
    notes.push(
      `A typical breakout launch here has ${fmtInt(d7.q[Q.p50])} players on day 7, ${ratio >= 1 ? `${ratio.toFixed(1)} times` : `${Math.round(ratio * 100)}% of`} the all-genre median.`,
    );
  }
  if (ann && impact) {
    notes.push(
      `Two days after an announced update, the median game is ${signed(ann.median)} against a week earlier (${signed(impact.announced.median)} across every genre).`,
    );
  }

  const yTop = niceMax(Math.max(...share.weeks.map((w) => w.share)));
  const weekFrom = Date.parse(trends.latestDay) - 6 * DAY_MS;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-9 px-4 pb-16 pt-6 md:px-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-[13px] text-muted-foreground">
        <Link href="/genres" className="text-text-2 hover:text-foreground">
          Genres
        </Link>
        <span aria-hidden="true">/</span>
        <span>{genre}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="flex flex-wrap items-center gap-3 font-heading text-[clamp(36px,6vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em]">
          <span aria-hidden="true" className="inline-block size-4 rounded-full" style={{ background: color }} />
          {genre}
          {idea ? <MomentumChip m={idea.momentum} /> : null}
        </h1>
        <p className="max-w-[760px] text-base text-text-2">
          Everything about {genre} on Roblox in one place: how many play it and where that is heading, its subgenres, the games leading and
          rising, what it earns, how launches and updates go.
        </p>
      </header>

      <section aria-label="Key figures" className="flex flex-wrap gap-3">
        <Tile label="Players this week" value={fmtCompact(share.players, 1)} hint={`average at once, week to ${fmtDay(Date.parse(trends.latestDay))}`} />
        <Tile
          label="Share of all players"
          value={pct1(share.share)}
          hint={share.mayShare !== null ? `${pct1(share.mayShare)} in May (method changed 25 Oct)` : "of every game we track"}
        />
        <Tile
          label="Against the market"
          value={idea?.vsMarket === null || idea?.vsMarket === undefined ? "—" : pts(idea.vsMarket)}
          hint={`players this week against last, minus every game's change`}
        />
        <Tile
          label="Est. revenue"
          value={rev ? <UsdSum ranks={rev.ranks} suffix="/mo" /> : "—"}
          hint={rev ? `${fmtInt(rev.ranked)} games in Top Earning, ${pct1(rev.share)} of the total` : "no games in Top Earning"}
        />
      </section>

      {notes.length ? (
        <section aria-labelledby="takeaways" className="flex flex-col gap-3 rounded-2xl border border-rise/35 bg-rise/8 px-6 py-5">
          <h2 id="takeaways" className="font-heading text-[22px] font-bold">
            Takeaways
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-text-soft">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <Section id="share" title="Share of players over time">
        <div className="flex flex-wrap gap-4">
          <div className="min-w-0 flex-[2_1_520px] rounded-2xl border border-border bg-card px-5 pb-3 pt-4">
            <LineChart
              series={[{ id: genre, label: genre, color, points: share.weeks.map((w) => [w.endMs, w.share]) }]}
              xKind="date"
              yKind="pct"
              xMin={share.weeks[0]?.endMs ?? weekFrom}
              xMax={share.weeks[share.weeks.length - 1]?.endMs ?? weekFrom}
              yMax={yTop.max}
              yStep={yTop.max / 2}
              height={220}
              endLabels={false}
              maxGap={8 * DAY_MS}
              marker={{ x: ALL_GAMES_FROM, label: "Every known game from 25 Oct" }}
              summary={`${genre} share of players by week, ${pct1(share.weeks[0]?.share ?? 0)} to ${pct1(share.share)}.`}
            />
          </div>
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-4">
            <h3 className="text-sm font-semibold">By month so far</h3>
            <ul className="flex flex-col gap-1.5 text-sm tabular-nums">
              {months.map((m) => (
                <li key={`${m.label}-${m.fromMs}`} className="flex items-center gap-3">
                  <span className="w-9 text-text-2">{m.label}</span>
                  <svg width="100%" height="10" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" className="min-w-0 flex-1">
                    <rect width="100" height="10" rx="5" fill="var(--grid)" />
                    <rect width={Math.max((m.share / monthMax) * 100, 2)} height="10" rx="5" fill={color} opacity={m.fromMs >= ALL_GAMES_FROM ? 1 : 0.6} />
                  </svg>
                  <span className="w-12 text-right">{pct1(m.share)}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12.5px] text-muted-foreground">
              Months up to October count only games in the discovery lists; from 25 October every known game counts (darker bars), so compare
              each side of that date on its own. History starts in May, so there is no year-on-year view yet.
            </p>
          </div>
        </div>
      </Section>

      {subgenres.length ? (
        <Section id="subgenres" title={`${genre} subgenres`} more={<span className="text-muted-foreground">Roblox&apos;s own, with 10+ games of 100+ players</span>}>
          <SubgenreTable rows={subgenres} showParent={false} />
        </Section>
      ) : (
        <p className="text-sm text-text-2">No {genre} subgenre has 10 or more games with 100+ players yet.</p>
      )}

      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="top" className="min-w-0 flex-[3_1_460px] rounded-2xl border border-border bg-card px-6 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="top" className="font-heading text-[22px] font-bold">
              Most played
            </h2>
            <Link href={`/explore?launched=any&genre=${encodeURIComponent(genre)}`} className="text-sm text-link hover:underline">
              All in Explore
            </Link>
          </div>
          <ol className="mt-2 flex flex-col">
            {topGames.map((g, i) => (
              <li key={g.universeId} className="flex items-center gap-3 border-t border-rule py-2 text-sm first:border-t-0">
                <span className="w-6 text-muted-foreground tabular-nums">{i + 1}</span>
                <Link href={`/games/${g.universeId}`} className="min-w-0 flex-1 truncate font-medium hover:text-link">
                  {displayName(g.name)}
                </Link>
                {g.subgenre ? <span className="hidden max-w-[160px] truncate text-xs text-muted-foreground sm:inline">{g.subgenre}</span> : null}
                {g.stage ? <StageBadge stage={g.stage} /> : null}
                <span className="w-16 text-right tabular-nums">{fmtCompact(g.cur7, 1)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="rising" className="min-w-0 flex-[2_1_320px] rounded-2xl border border-border bg-card px-6 py-5">
          <h2 id="rising" className="font-heading text-[22px] font-bold">
            Rising this week
          </h2>
          {rising.length ? (
            <ol className="mt-2 flex flex-col">
              {rising.map((g) => (
                <li key={g.universeId} className="flex items-center gap-3 border-t border-rule py-2 text-sm first:border-t-0">
                  <Link href={`/games/${g.universeId}`} className="min-w-0 flex-1 truncate font-medium hover:text-link">
                    {displayName(g.name)}
                  </Link>
                  <span className="whitespace-nowrap font-semibold text-rise tabular-nums">+{Math.round(g.wowPct!)}%</span>
                  <span className="w-14 text-right text-muted-foreground tabular-nums">{fmtCompact(g.cur7, 1)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-text-2">No {genre} game with 1,000+ players grew this week.</p>
          )}
        </section>
      </div>

      {earners.length ? (
        <Section
          id="earners"
          title="Top earners"
          more={
            <Link href="/revenue#list" className="text-link hover:underline">
              Full Top Earning list
            </Link>
          }
        >
          <ol className="grid gap-2 sm:grid-cols-2">
            {earners.map((g) => (
              <li key={g.universeId} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                <span className="w-10 text-muted-foreground tabular-nums">#{g.rank}</span>
                <Link href={`/games/${g.universeId}`} className="min-w-0 flex-1 truncate font-medium hover:text-link">
                  {displayName(g.name)}
                </Link>
                <span className="whitespace-nowrap tabular-nums">
                  <Usd rank={g.effRank} prefix="est. " suffix="/mo" />
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="bench" className="min-w-0 flex-[1_1_320px] rounded-2xl border border-border bg-card px-6 py-5">
          <h2 id="bench" className="font-heading text-[22px] font-bold">
            What a game here looks like
          </h2>
          {b ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Median, of {fmtInt(b.n)} games with 1,000+</dt>
                <dd className="font-heading text-2xl font-extrabold">{fmtInt(b.p50)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Top 10% from</dt>
                <dd className="font-heading text-2xl font-extrabold">{fmtInt(b.p90)}</dd>
              </div>
              {b.session ? (
                <div>
                  <dt className="text-muted-foreground">Median session</dt>
                  <dd className="font-heading text-2xl font-extrabold">{b.session.p50.toFixed(1)} min</dd>
                </div>
              ) : null}
              {bench.all.session ? (
                <div>
                  <dt className="text-muted-foreground">Across every genre</dt>
                  <dd className="font-heading text-2xl font-extrabold">{bench.all.session.p50.toFixed(1)} min</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-text-2">Too few {genre} games with 1,000+ players this week for a benchmark.</p>
          )}
        </section>

        <section aria-labelledby="launches" className="min-w-0 flex-[1_1_320px] rounded-2xl border border-border bg-card px-6 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="launches" className="font-heading text-[22px] font-bold">
              Launches
            </h2>
            <Link href={`/launches?genre=${encodeURIComponent(genre)}`} className="text-sm text-link hover:underline">
              Launch curves
            </Link>
          </div>
          {d7 ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Median, day 7</dt>
                <dd className="font-heading text-2xl font-extrabold">{fmtInt(d7.q[Q.p50])}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Top 10% from, day 7</dt>
                <dd className="font-heading text-2xl font-extrabold">{fmtInt(d7.q[Q.p90])}</dd>
              </div>
              {d30 ? (
                <div>
                  <dt className="text-muted-foreground">Still played on day 30</dt>
                  <dd className="font-heading text-2xl font-extrabold">{Math.round((100 * d30.playing) / d30.games)}%</dd>
                </div>
              ) : null}
              {idea ? (
                <div>
                  <dt className="text-muted-foreground">New games, hit 1,000</dt>
                  <dd className="pt-2">
                    <HitBar hits={idea.hits} launches={idea.launches} />
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-text-2">Too few {genre} launches for launch curves yet.</p>
          )}
          <p className="mt-3 text-[12.5px] text-muted-foreground">Launches that reached the discovery lists, counted from that day.</p>
        </section>

        <section aria-labelledby="updates" className="min-w-0 flex-[1_1_320px] rounded-2xl border border-border bg-card px-6 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="updates" className="font-heading text-[22px] font-bold">
              Updates
            </h2>
            <Link href="/updates" className="text-sm text-link hover:underline">
              Update impact
            </Link>
          </div>
          {ann ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Median change after</dt>
                <dd className={`font-heading text-2xl font-extrabold ${ann.median >= 0 ? "text-rise" : "text-fall"}`}>{signed(ann.median)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rose</dt>
                <dd className="font-heading text-2xl font-extrabold">{Math.round(ann.shareUp * 100)}%</dd>
              </div>
              <div className="col-span-2 text-[12.5px] text-muted-foreground">
                {fmtInt(ann.events)} announced updates; players on the two days after against the same days a week earlier.
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-text-2">Fewer than 30 announced {genre} updates with a result so far.</p>
          )}
        </section>
      </div>

      {patterns.length ? (
        <Section
          id="patterns"
          title="Words in the names that work"
          more={
            <Link href={`/ideas?genre=${encodeURIComponent(genre)}`} className="text-link hover:underline">
              Every {genre} pattern
            </Link>
          }
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {patterns.map((p) => (
              <li key={p.term} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
                <Link href={`/explore?launched=any&q=${encodeURIComponent(p.term)}`} className="min-w-0 flex-1 truncate font-semibold hover:text-link">
                  {p.term}
                </Link>
                <MomentumChip m={p.momentum} />
                <span className="w-16 text-right tabular-nums">{fmtCompact(p.players, 1)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <p className="text-[13px] text-muted-foreground">
        Players are averages over the last 7 complete days. Revenue is modelled from Roblox&apos;s Top Earning list.{" "}
        <Link href="/methodology" className="text-link underline">
          How we measure
        </Link>
      </p>
    </main>
  );
}
