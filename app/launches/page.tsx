import type { Metadata } from "next";
import Link from "next/link";
import { getSiteDb } from "@/lib/db/site";
import { getCachedLaunchCurves } from "@/lib/trends/cached";
import { getLaunchGame, MAX_START_AGE_DAYS, Q, standing, type LaunchDay, type LaunchGame } from "@/lib/trends/launches";
import { parseSearch, searchGames } from "@/lib/trends/search";
import { displayName } from "@/lib/trends/names";
import { genreColor } from "@/lib/trends/genres";
import { fmtDay, fmtInt } from "@/lib/format";
import { LaunchChart } from "@/components/v2/LaunchChart";
import { RangeBar } from "@/components/v2/RangeBar";
import { AutoSubmitForm } from "@/components/v2/AutoSubmitForm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Is my launch on track? Roblox Pulse",
  description:
    "How new Roblox games do in their first 90 days, from thousands of launches since May 2026. Compare any launch against the median and the top 10%.",
};

const KEY_DAYS = [1, 3, 7, 14, 30, 60, 90];
const selectClass = "select";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
// The bars share one log scale, so rows compare directly.
const ly = (v: number) => Math.log10(1 + Math.max(v, 0));

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex-[1_1_150px] sm:flex-[1_1_220px] rounded-2xl border border-border bg-card px-5 py-4">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-[26px] sm:text-[34px] font-extrabold tracking-tight">{value}</div>
      <div className="text-[13px] text-muted-foreground">{hint}</div>
    </div>
  );
}

// Where a game stands among launches on one day, in words.
function standingText(share: number): string {
  if (share >= 0.95) return "top 5%";
  if (share >= 0.5) return `top ${Math.max(5, Math.round((1 - share) * 100))}%`;
  if (share <= 0) return "no players";
  return `ahead of ${Math.round(share * 100)}%`;
}

async function findLaunch(q: string): Promise<{ game: LaunchGame | null; asked: boolean; notLaunch: string | null }> {
  const db = getSiteDb();
  const query = parseSearch(q);
  if (!db || !query) return { game: null, asked: false, notLaunch: null };
  const hits = await searchGames(db, query, 10);
  for (const h of hits) {
    const game = await getLaunchGame(db, h.universeId);
    if (game) return { game, asked: true, notLaunch: null };
  }
  return { game: null, asked: true, notLaunch: hits[0] ? displayName(hits[0].name) : null };
}

export default async function LaunchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const found = await findLaunch(q);
  // A picked game is compared with its own genre unless the reader chose otherwise.
  const genreParam = first(sp.genre);
  const genre = genreParam === "all" ? null : genreParam || found.game?.genre || null;
  const curves = await getCachedLaunchCurves(genre).catch(() => null);

  if (!curves || !curves.days.length) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Is my launch on track?</h1>
        <p className="mt-4 text-text-2">
          {curves ? `Too few ${genre} launches to draw curves yet.` : "Launch curves are temporarily unavailable. Please try again shortly."}{" "}
          {curves ? (
            <Link href="/launches" className="text-link hover:underline">
              See every genre
            </Link>
          ) : null}
        </p>
      </main>
    );
  }

  const byDay = new Map(curves.days.map((d) => [d.day, d]));
  const game = found.game;
  const gameName = game ? displayName(game.name) : null;
  const gameDays = game ? game.points.filter(([d]) => byDay.has(d)) : [];
  const latest = gameDays[gameDays.length - 1];
  const latestStanding = latest ? standing(byDay.get(latest[0])!.q, latest[1]) : null;
  const best = gameDays.reduce<[number, number] | null>((a, p) => (!a || p[1] > a[1] ? p : a), null);
  const bandOf = (d: LaunchDay) => ({ day: d.day, p10: d.q[Q.p10], p25: d.q[Q.p25], p50: d.q[Q.p50], p75: d.q[Q.p75], p90: d.q[Q.p90] });
  const scaleMax = ly(Math.max(...curves.days.map((d) => d.q[Q.p90]), ...gameDays.map((p) => p[1]), 100));
  const d7 = byDay.get(7);
  const d30 = byDay.get(30);
  const label = genre ?? "all";

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-9 md:px-6">
      <section className="flex flex-col gap-3">
        <h1 className="font-heading text-[clamp(36px,6vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">Is my launch on track?</h1>
        <p className="max-w-[760px] text-base text-text-2">
          How {fmtInt(curves.cohort)} {genre ? `${genre} ` : ""}games launched since May did in their first 90 days, counted from the day each first
          reached Roblox&apos;s discovery lists. These are launches that broke through: most new games never reach the lists, so the bar is
          higher than for a typical release. Find a game to see where it stands.
        </p>
      </section>

      <AutoSubmitForm action="/launches" className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-[1_1_320px] flex-col gap-1 text-[13px] text-muted-foreground">
          Game
          <input
            name="q"
            defaultValue={q}
            placeholder="Name, Roblox link or ID"
            className="h-10 rounded-[10px] border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted-foreground">
          Compare with
          <select name="genre" defaultValue={genre ?? "all"} className={selectClass}>
            <option value="all">Every genre</option>
            {curves.genres
              .filter((g) => g.games >= 100 && g.genre !== "All" && g.genre !== "Other")
              .map((g) => (
                <option key={g.genre} value={g.genre}>
                  {g.genre} ({fmtInt(g.games)})
                </option>
              ))}
          </select>
        </label>
        <button type="submit" className="btn h-10">
          Compare
        </button>
      </AutoSubmitForm>

      {found.asked && !game ? (
        <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-text-2">
          {found.notLaunch
            ? `${found.notLaunch} isn't a launch we can compare: only games created since May that reached the discovery lists within ${MAX_START_AGE_DAYS} days count.`
            : "No tracked game matches that search."}
        </p>
      ) : null}

      <section aria-label="Key figures" className="flex flex-wrap gap-3">
        {game && latest && latestStanding !== null ? (
          <>
            <Tile
              label={`${gameName}, day ${latest[0]}`}
              value={standingText(latestStanding)}
              hint={`${fmtInt(latest[1])} players a day on average, against ${label === "all" ? "every" : label} launch${label === "all" ? "" : "es"}`}
            />
            {best ? <Tile label="Its best day so far" value={fmtInt(best[1])} hint={`day ${best[0]}, ${fmtDay(game.startMs + best[0] * 86_400_000)}`} /> : null}
          </>
        ) : null}
        {d7 ? <Tile label="Median launch, day 7" value={fmtInt(d7.q[Q.p50])} hint={`of launches that reached the lists; top 10% from ${fmtInt(d7.q[Q.p90])}`} /> : null}
        {d30 ? (
          <Tile
            label="Still played on day 30"
            value={`${Math.round((100 * d30.playing) / d30.games)}%`}
            hint="of launches have any players a month in"
          />
        ) : null}
      </section>

      <section aria-labelledby="curves" className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-6 pb-4 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="curves" className="font-heading text-[22px] font-bold">
            First 90 days
          </h2>
          {genre ? (
            <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: genreColor(genre) }} aria-hidden="true" />
              {genre} launches
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground">Every genre</span>
          )}
        </div>
        <LaunchChart
          bands={curves.days.map(bandOf)}
          game={game && gameName ? { name: gameName, points: gameDays } : undefined}
          summary={`Players a day by days since launch: median ${fmtInt(d7?.q[Q.p50] ?? 0)} on day 7${game && latest ? `; ${gameName} ${fmtInt(latest[1])} on day ${latest[0]}` : ""}.`}
        />
      </section>

      <section aria-labelledby="days" className="flex flex-col gap-3">
        <h2 id="days" className="font-heading text-[28px] font-bold tracking-[-0.02em]">
          What on track looks like
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="pin w-full min-w-[760px] border-collapse text-sm tabular-nums">
            <caption className="sr-only">Average players a day at key points after launch</caption>
            <thead>
              <tr className="text-right text-xs text-muted-foreground">
                <th data-pin="" scope="col" className="px-4 py-3 text-left font-medium">
                  Day
                </th>
                <th scope="col" className="px-2 py-3 font-medium">Median</th>
                <th scope="col" className="px-2 py-3 font-medium">Top quarter from</th>
                <th scope="col" className="px-2 py-3 font-medium">Top 10% from</th>
                {game ? <th scope="col" className="px-2 py-3 font-medium">{gameName}</th> : null}
                <th scope="col" className="px-4 py-3 text-left font-medium">Middle half and top 10%, log scale</th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap text-right">
              {KEY_DAYS.filter((d) => byDay.has(d)).map((d) => {
                const row = byDay.get(d)!;
                const mine = game?.points.find(([n]) => n === d);
                return (
                  <tr key={d} className="border-t border-rule">
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">
                      Day {d}
                    </th>
                    <td className="px-2 py-2.5 font-semibold">{fmtInt(row.q[Q.p50])}</td>
                    <td className="px-2 py-2.5">{fmtInt(row.q[Q.p75])}</td>
                    <td className="px-2 py-2.5">{fmtInt(row.q[Q.p90])}</td>
                    {game ? (
                      <td className="px-2 py-2.5">
                        {mine ? (
                          <>
                            {fmtInt(mine[1])} <span className="text-muted-foreground">({standingText(standing(row.q, mine[1]))})</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">not yet</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-4 py-2.5">
                      <RangeBar
                        p25={ly(row.q[Q.p25])}
                        p50={ly(row.q[Q.p50])}
                        p75={ly(row.q[Q.p75])}
                        p90={ly(row.q[Q.p90])}
                        min={0}
                        max={scaleMax}
                        label={`Day ${d}: middle half ${fmtInt(row.q[Q.p25])} to ${fmtInt(row.q[Q.p75])}, top 10% from ${fmtInt(row.q[Q.p90])}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="max-w-[860px] text-[13px] text-muted-foreground">
          Day 0 is the first day a game reached Roblox&apos;s discovery lists, not the day it was created: studios often create a game long before they
          publish it. Only games created since 8 May that reached the lists within {MAX_START_AGE_DAYS} days count, so these are new games breaking
          through, and launches that never reached the lists are not here: the bar is higher than for every game on Roblox. Since 24 October every
          known game is read at least daily, so a day with no reading counts as zero players; each day&apos;s curve uses only launches for which
          that day fell on or after 24 October, so games that faded are never dropped.
        </p>
      </section>
    </main>
  );
}
