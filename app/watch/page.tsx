import type { Metadata } from "next";
import Link from "next/link";
import { getSiteDb } from "@/lib/db/site";
import { getCachedGenreTrends, getCachedHitLives } from "@/lib/trends/cached";
import { getWatch, parseWatch, watchQuery } from "@/lib/trends/watch";
import { displayName } from "@/lib/trends/names";
import { fmtDay, fmtInt, fmtPct } from "@/lib/format";
import { FollowButton } from "@/components/v2/FollowButton";
import { WatchLoader } from "@/components/v2/WatchLoader";
import { GenreChip } from "@/components/v2/GenreChip";

export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Watchlist: Roblox Pulse",
  description: "The games, studios and subgenres you follow, with what changed this month.",
  robots: { index: false },
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default async function WatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const list = parseWatch({ g: one("g"), s: one("s"), sub: one("sub") });
  const empty = !list.games.length && !list.studios.length && !list.subgenres.length;
  const db = getSiteDb();
  const [hitLives, trends] = empty ? [[], null] : await Promise.all([getCachedHitLives().catch(() => []), getCachedGenreTrends().catch(() => null)]);
  const w = !empty && db ? await getWatch(db, list, { hitLives, subgenres: trends?.subgenres ?? [] }) : null;
  const q = watchQuery(list);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-9 md:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Watchlist</h1>
        <p className="max-w-2xl text-text-2">
          The games, studios and subgenres you follow, and what changed in the last 30 days. The list lives in this page&apos;s address and in
          this browser, so bookmark it to keep it.
        </p>
        {q ? (
          <p className="text-sm">
            <a href={`/feeds/watch.xml?${q}`} className="text-link underline">
              RSS feed of these alerts
            </a>
            <span className="text-muted-foreground"> · add it to a reader, or to a Discord or Slack channel with an RSS bot</span>
          </p>
        ) : null}
      </header>

      {empty ? <WatchLoader /> : null}
      {!empty && !w ? <p className="text-text-2">The watchlist is temporarily unavailable. Please try again shortly.</p> : null}

      {w ? (
        <>
          <section aria-labelledby="alerts" className="flex flex-col gap-3 rounded-2xl border border-rise/35 bg-rise/8 px-6 py-5">
            <h2 id="alerts" className="font-heading text-[22px] font-bold">
              What changed
            </h2>
            {w.events.length ? (
              <ul className="flex flex-col">
                {w.events.slice(0, 40).map((e) => (
                  <li key={e.guid} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-rule py-2.5 text-sm first:border-t-0">
                    <span className="w-14 shrink-0 text-muted-foreground">{fmtDay(e.dateMs)}</span>
                    <a href={e.link.replace(/^https?:\/\/[^/]+/, "")} className="font-medium hover:text-link">
                      {e.title}
                    </a>
                    <span className="text-text-2">{e.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-2">Nothing notable in the last 30 days.</p>
            )}
            <p className="text-[13px] text-muted-foreground">
              Alerts: a week-on-week change of 30% or more, a new best week, a new title or announced update, a fall below half the best week, new
              games from studios you follow, and a subgenre&apos;s share moving half a point or more since late October.
            </p>
          </section>

          {w.games.length ? (
            <section aria-labelledby="wgames" className="flex flex-col gap-3">
              <h2 id="wgames" className="font-heading text-2xl font-bold">
                Games
              </h2>
              <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="pin w-full min-w-[760px] border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="text-right text-xs text-muted-foreground">
                      <th data-pin="" scope="col" className="px-4 py-3 text-left font-medium">Game</th>
                      <th scope="col" className="px-2 py-3 text-left font-medium">Genre</th>
                      <th scope="col" className="px-2 py-3 font-medium">This week</th>
                      <th scope="col" className="px-2 py-3 font-medium">Change</th>
                      <th scope="col" className="px-2 py-3 font-medium">Best week</th>
                      <th scope="col" className="px-2 py-3 font-medium">Of best</th>
                      <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Unfollow</span></th>
                    </tr>
                  </thead>
                  <tbody className="whitespace-nowrap text-right">
                    {w.games.map((g) => {
                      const ch = g.cur7 !== null && g.prev7 ? g.cur7 / g.prev7 - 1 : null;
                      return (
                        <tr key={g.universeId} className="border-t border-rule">
                          <th scope="row" className="max-w-[280px] truncate px-4 py-2.5 text-left font-medium">
                            <Link href={`/games/${g.universeId}`} className="hover:text-link">
                              {displayName(g.name)}
                            </Link>
                          </th>
                          <td className="px-2 py-2.5 text-left">
                            <GenreChip genre={g.genre} link />
                          </td>
                          <td className="px-2 py-2.5">{g.cur7 === null ? "—" : fmtInt(g.cur7)}</td>
                          <td className={`px-2 py-2.5 ${ch === null ? "" : ch >= 0 ? "text-rise" : "text-fall"}`}>{ch === null ? "—" : fmtPct(ch * 100)}</td>
                          <td className="px-2 py-2.5">{g.peak7 === null ? "—" : fmtInt(g.peak7)}</td>
                          <td className="px-2 py-2.5">{g.peak7 && g.cur7 !== null ? pct(g.cur7 / g.peak7) : "—"}</td>
                          <td className="px-4 py-2.5">
                            <FollowButton kind="g" value={String(g.universeId)} label={displayName(g.name)} compact />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {w.studios.length ? (
            <section aria-labelledby="wstudios" className="flex flex-col gap-3">
              <h2 id="wstudios" className="font-heading text-2xl font-bold">
                Studios
              </h2>
              <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full min-w-[640px] border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="text-right text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-3 text-left font-medium">Studio</th>
                      <th scope="col" className="px-2 py-3 font-medium">Public games</th>
                      <th scope="col" className="px-2 py-3 font-medium">Playing now</th>
                      <th scope="col" className="px-2 py-3 text-left font-medium">Newest game</th>
                      <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Unfollow</span></th>
                    </tr>
                  </thead>
                  <tbody className="whitespace-nowrap text-right">
                    {w.studios.map((s) => (
                      <tr key={`${s.kind}:${s.id}`} className="border-t border-rule">
                        <th scope="row" className="px-4 py-2.5 text-left font-medium">
                          <Link href={`/studios/${s.kind}/${s.id}`} className="hover:text-link">
                            {s.name ?? `${s.kind === "group" ? "Group" : "User"} ${s.id}`}
                          </Link>
                        </th>
                        <td className="px-2 py-2.5">{fmtInt(s.games)}</td>
                        <td className="px-2 py-2.5">{fmtInt(s.playing)}</td>
                        <td className="max-w-[300px] truncate px-2 py-2.5 text-left">
                          {s.newest ? (
                            <>
                              {displayName(s.newest.name)} <span className="text-muted-foreground">{fmtDay(s.newest.createdMs)} {new Date(s.newest.createdMs).getUTCFullYear()}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <FollowButton kind="s" value={`${s.kind}:${s.id}`} label={s.name ?? "studio"} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {w.subgenres.length ? (
            <section aria-labelledby="wsubs" className="flex flex-col gap-3">
              <h2 id="wsubs" className="font-heading text-2xl font-bold">
                Subgenres
              </h2>
              <div className="relative overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full min-w-[640px] border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="text-right text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-3 text-left font-medium">Subgenre</th>
                      <th scope="col" className="px-2 py-3 font-medium">Games</th>
                      <th scope="col" className="px-2 py-3 font-medium">Average players</th>
                      <th scope="col" className="px-2 py-3 font-medium">Share of all</th>
                      <th scope="col" className="px-2 py-3 font-medium">Since late October</th>
                      <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Unfollow</span></th>
                    </tr>
                  </thead>
                  <tbody className="whitespace-nowrap text-right">
                    {w.subgenres.map((s) => {
                      const d = s.firstShare === null ? null : (s.share - s.firstShare) * 100;
                      return (
                        <tr key={`${s.genre}|${s.subgenre}`} className="border-t border-rule">
                          <th scope="row" className="px-4 py-2.5 text-left font-medium">
                            {s.subgenre} <span className="font-normal text-muted-foreground">{s.genre}</span>
                          </th>
                          <td className="px-2 py-2.5">{fmtInt(s.games)}</td>
                          <td className="px-2 py-2.5">{fmtInt(s.players)}</td>
                          <td className="px-2 py-2.5">{pct(s.share)}</td>
                          <td className={`px-2 py-2.5 ${d === null || Math.abs(d) < 0.05 ? "" : d > 0 ? "text-rise" : "text-fall"}`}>
                            {d === null ? "—" : `${d >= 0.05 ? "+" : d <= -0.05 ? "−" : ""}${Math.abs(d).toFixed(1)} pts`}
                          </td>
                          <td className="px-4 py-2.5">
                            <FollowButton kind="sub" value={`${s.genre}|${s.subgenre}`} label={s.subgenre ?? "subgenre"} compact />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
