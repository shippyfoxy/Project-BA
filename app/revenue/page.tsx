import type { Metadata } from "next";
import Link from "next/link";
import { getCachedGenreTrends, getCachedRevenuePage } from "@/lib/trends/cached";
import { estMonthlyDevEx, fmtUsdEstimate } from "@/lib/trends/revenue";
import type { RankedGame } from "@/lib/trends/revenuePage";
import { displayName } from "@/lib/trends/names";
import { genreColor } from "@/lib/trends/genres";
import { getGameIcons } from "@/lib/roblox/thumbnails";
import { fmtDay, fmtInt } from "@/lib/format";
import { GameIcon } from "@/components/v2/GameIcon";
import { GenreChip } from "@/components/v2/GenreChip";
import { ProLock, ProStar } from "@/components/pro/Pro";
import { isProSession } from "@/lib/pro";

// Rendered per visitor (Pro or not); the data underneath is cached hourly.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Revenue: Roblox Pulse",
  description: "Roblox's Top Earning list with estimated creator payouts for every ranked game, the biggest movers and revenue by genre.",
};

const SHOWN = 100;
const PREVIEW = 5;

function Upgrade() {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/7 p-6">
      <h2 className="flex items-center gap-2 font-heading text-2xl font-bold">
        <ProStar className="size-5" />
        Revenue is part of Roblox Pulse Pro
      </h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-text-2">
        <li>Estimated monthly payouts for all ~460 games in Roblox&apos;s Top Earning list, with ranges</li>
        <li>Daily climbers and fallers, revenue per player and revenue by genre</li>
        <li>Dollar figures across the site, CSV exports, 30 and 90-day windows and the full API</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/pro"
          className="inline-flex h-11 items-center rounded-xl bg-gold px-5 text-sm font-bold text-background hover:brightness-110"
        >
          Get Pro, $5 a month
        </Link>
        <span className="text-[13px] text-muted-foreground">Ranks stay free everywhere on the site.</span>
      </div>
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex-[1_1_150px] sm:flex-[1_1_220px] rounded-2xl border border-border bg-card px-5 py-4">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-[26px] sm:text-[34px] font-extrabold tracking-tight">{value}</div>
      <div className="text-[13px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function Move({ g }: { g: RankedGame }) {
  if (g.prevRank === null) return <span className="text-xs font-medium text-gold">new</span>;
  const d = g.prevRank - g.rank;
  if (d === 0) return <span className="text-muted-foreground">–</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${d > 0 ? "text-rise" : "text-fall"}`}>
      <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">
        <polygon points={d > 0 ? "5,1 9.5,9 0.5,9" : "0.5,1 9.5,1 5,9"} fill="currentColor" />
      </svg>
      {Math.abs(d)}
      <span className="sr-only">{d > 0 ? " places up" : " places down"}</span>
    </span>
  );
}

function MoverCard({ title, games, icons }: { title: string; games: RankedGame[]; icons: Map<number, string> }) {
  return (
    <div className="min-w-0 flex-[1_1_440px] overflow-hidden rounded-2xl border border-border bg-card">
      <h3 className="border-b border-border px-5 py-3.5 text-[15px] font-semibold">{title}</h3>
      {games.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">None today.</p>
      ) : (
        <ol>
          {games.map((g) => {
            const name = displayName(g.name);
            return (
              <li key={g.universeId} className="flex items-center gap-3 border-t border-rule px-5 py-2.5 first:border-t-0">
                <GameIcon url={icons.get(g.universeId)} name={name} size={36} />
                <span className="min-w-0 flex-1">
                  <Link href={`/games/${g.universeId}`} className="block truncate font-medium hover:text-link">
                    {name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    #{g.prevRank ?? "unlisted"} to #{g.rank}
                  </span>
                </span>
                <span className="text-right text-sm tabular-nums">
                  <Move g={g} />
                  <span className="block text-xs text-muted-foreground">est. {fmtUsdEstimate(g.estMonthly)}/mo</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default async function RevenuePage() {
  const [data, trends] = await Promise.all([getCachedRevenuePage(), getCachedGenreTrends()]);
  if (!data || data.games.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Revenue</h1>
        <p className="mt-4 text-text-2">Revenue figures are temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }

  const pro = await isProSession();
  const { games, listDay, prevDay, totalEst, medianEst } = data;
  const shown = games.slice(0, pro ? SHOWN : PREVIEW);
  const top10 = games.slice(0, 10).reduce((a, g) => a + g.estMonthly, 0);
  const climbers = prevDay
    ? games
        .filter((g) => g.prevRank !== null && g.prevRank - g.rank >= 5)
        .sort((a, b) => b.prevRank! - b.rank - (a.prevRank! - a.rank))
        .slice(0, 6)
    : [];
  const fallers = prevDay
    ? games
        .filter((g) => g.prevRank !== null && g.rank - g.prevRank >= 5)
        .sort((a, b) => b.rank - b.prevRank! - (a.rank - a.prevRank!))
        .slice(0, 6)
    : [];
  const entries = prevDay ? games.filter((g) => g.prevRank === null) : [];
  const perPlayer = games
    .filter((g) => g.cur7 !== null && g.cur7 >= 1_000)
    .sort((a, b) => b.estMonthly / b.cur7! - a.estMonthly / a.cur7!)
    .slice(0, 10);
  const icons = await getGameIcons([...shown, ...climbers, ...fallers, ...perPlayer].map((g) => g.universeId));
  const genres = trends?.revenue.genres.filter((g) => g.ranked >= 3) ?? [];
  const genreMax = Math.max(...genres.map((g) => g.share), 0.01);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-9 md:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Revenue</h1>
        <p className="max-w-3xl text-text-2">
          Roblox&apos;s own Top Earning list ranks games by Robux spent in the last 7 days. Roblox publishes the order but never the
          amounts, so every dollar figure here is an estimate modelled from the rank, averaged over the last 7 lists so a one-day swap with a neighbour barely moves it.{" "}
          <Link href="/methodology#revenue" className="text-link underline">
            How it is estimated
          </Link>
        </p>
      </header>

      <section aria-label="Key figures" className="flex flex-wrap gap-3">
        <Tile label="Games ranked" value={fmtInt(games.length)} hint={`Top Earning list, ${fmtDay(Date.parse(listDay))}`} />
        {pro ? (
          <>
            <Tile label="Est. payouts a month" value={fmtUsdEstimate(totalEst)} hint="across every ranked game (modelled)" />
            <Tile label="Top 10's share" value={`${Math.round((100 * top10) / totalEst)}%`} hint="of the estimated total" />
            <Tile label="Median ranked game" value={`${fmtUsdEstimate(medianEst)}/mo`} hint="estimated payout" />
          </>
        ) : null}
      </section>

      {pro ? null : <Upgrade />}

      {pro ? (
        <section aria-labelledby="movers" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="movers" className="font-heading text-[28px] font-bold tracking-tight">
              Biggest moves in Top Earning
            </h2>
            {prevDay ? (
              <span className="text-[13px] text-muted-foreground">
                {fmtDay(Date.parse(prevDay))} to {fmtDay(Date.parse(listDay))}, moves of 5+ places
              </span>
            ) : null}
          </div>
          {prevDay ? (
            <>
              <div className="flex flex-wrap gap-4">
                <MoverCard title="Climbing" games={climbers} icons={icons} />
                <MoverCard title="Slipping" games={fallers} icons={icons} />
              </div>
              {entries.length ? (
                <p className="text-[13px] text-muted-foreground">
                  {fmtInt(entries.length)} {entries.length === 1 ? "game" : "games"} entered the list, led by{" "}
                  <Link href={`/games/${entries[0].universeId}`} className="text-link underline">
                    {displayName(entries[0].name)}
                  </Link>{" "}
                  at #{entries[0].rank}.
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-2xl border border-border bg-card p-5 text-sm text-text-2">
              Ranks have been recorded since {fmtDay(Date.parse(listDay))}. Daily climbers and fallers appear here once there is a second
              day to compare.
            </p>
          )}
        </section>
      ) : null}

      <section aria-labelledby="list" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="list" className="font-heading text-[28px] font-bold tracking-tight">
            Top Earning, {fmtDay(Date.parse(listDay))}
          </h2>
          <span className="flex flex-wrap gap-3 text-sm">
            <Link href="/explore?launched=any&earning=1&sort=earnings" className="text-link hover:underline">
              All {fmtInt(games.length)} in Explore
            </Link>
            {pro ? (
              <a href="/api/v1/explore?launched=any&earning=1&sort=earnings&format=csv" className="text-link hover:underline">
                Download CSV
              </a>
            ) : null}
          </span>
        </div>
        <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="pin w-full min-w-[880px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="text-right text-xs text-muted-foreground">
                <th scope="col" className="w-14 px-4 py-3 text-left font-medium">
                  Rank
                </th>
                {prevDay ? (
                  <th scope="col" className="w-14 px-2 py-3 font-medium">
                    Move
                  </th>
                ) : null}
                <th data-pin="" scope="col" className="px-2 py-3 text-left font-medium">
                  Game
                </th>
                <th scope="col" className="px-2 py-3 font-medium">
                  Est. per month
                </th>
                <th scope="col" className="px-2 py-3 font-medium">
                  Range
                </th>
                <th scope="col" className="px-2 py-3 font-medium">
                  7-day avg players
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Per concurrent player
                </th>
              </tr>
            </thead>
            <tbody className="whitespace-nowrap text-right">
              {shown.map((g) => {
                const name = displayName(g.name);
                const est = estMonthlyDevEx(g.effRank)!;
                return (
                  <tr key={g.universeId} className="border-t border-rule hover:bg-surface-2">
                    <td className="px-4 py-2.5 text-left text-text-2">#{g.rank}</td>
                    {prevDay ? (
                      <td className="px-2 py-2.5">
                        <Move g={g} />
                      </td>
                    ) : null}
                    <th scope="row" className="px-2 py-2.5 text-left font-medium">
                      <Link href={`/games/${g.universeId}`} className="flex items-center gap-3 hover:text-link">
                        <GameIcon url={icons.get(g.universeId)} name={name} size={36} />
                        <span className="min-w-0">
                          <span className="block max-w-[300px] truncate">{name}</span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs font-normal text-muted-foreground">
                            <GenreChip genre={g.genre} />
                            <span className="max-w-[160px] truncate">{g.creatorName}</span>
                          </span>
                        </span>
                      </Link>
                    </th>
                    <td className="px-2 py-2.5 font-semibold">{pro ? fmtUsdEstimate(est.mid) : <ProLock />}</td>
                    <td className="px-2 py-2.5 text-text-2">
                      {pro ? `${fmtUsdEstimate(est.low)} to ${fmtUsdEstimate(est.high)}` : <ProLock />}
                    </td>
                    <td className="px-2 py-2.5">{g.cur7 === null ? <span className="text-muted-foreground">—</span> : fmtInt(g.cur7)}</td>
                    <td className="px-4 py-2.5">
                      {g.cur7 === null || g.cur7 < 1_000 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : pro ? (
                        `$${Math.round(est.mid / g.cur7).toLocaleString("en-GB")}`
                      ) : (
                        <ProLock />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {pro ? `Showing the top ${SHOWN}.` : `A preview of the top ${PREVIEW}; ranks for every game are free in Explore.`} Per player is
          the estimated monthly payout divided by average concurrent players, for games averaging 1,000+.
        </p>
      </section>

      {pro ? (
        <div className="flex flex-wrap gap-4">
          <section
            aria-labelledby="per-player"
            className="min-w-0 flex-[1_1_440px] overflow-hidden rounded-2xl border border-border bg-card"
          >
            <h2 id="per-player" className="border-b border-border px-5 py-3.5 font-heading text-[20px] font-bold">
              Most revenue per concurrent player
            </h2>
            <ol>
              {perPlayer.map((g) => {
                const name = displayName(g.name);
                return (
                  <li key={g.universeId} className="flex items-center gap-3 border-t border-rule px-5 py-2.5 first:border-t-0">
                    <span className="w-9 shrink-0 text-right text-sm tabular-nums text-muted-foreground">#{g.rank}</span>
                    <GameIcon url={icons.get(g.universeId)} name={name} size={32} />
                    <Link href={`/games/${g.universeId}`} className="min-w-0 flex-1 truncate font-medium hover:text-link">
                      {name}
                    </Link>
                    <span className="text-right text-sm tabular-nums">
                      est. ${Math.round(g.estMonthly / g.cur7!).toLocaleString("en-GB")}
                      <span className="block text-xs text-muted-foreground">{fmtInt(g.cur7!)} players</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section
            aria-labelledby="by-genre"
            className="min-w-0 flex-[1_1_440px] rounded-2xl border border-border bg-card px-5 pb-4 pt-3.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="by-genre" className="font-heading text-[20px] font-bold">
                Estimated revenue by genre
              </h2>
              <Link href="/genres#revenue" className="text-sm text-link hover:underline">
                Against players
              </Link>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5">
              {genres.map((g) => (
                <li key={g.genre} className="grid grid-cols-[150px_minmax(0,1fr)_64px] items-center gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block size-2 shrink-0 rounded-full"
                      style={{ background: genreColor(g.genre) }}
                    />
                    <span className="truncate">{g.genre}</span>
                  </span>
                  <span
                    className="h-2.5 rounded-sm bg-gold"
                    style={{
                      width: `${Math.max((g.share / genreMax) * 100, 1)}%`,
                    }}
                  />
                  <span className="text-right tabular-nums text-text-2">{fmtUsdEstimate(g.est)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-muted-foreground">Summed over each genre&apos;s ranked games, per month, modelled.</p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
