import type { Metadata } from "next";
import Link from "next/link";
import { getSiteDb } from "@/lib/db/site";
import { parseSearch, searchGames, type SearchHit } from "@/lib/trends/search";
import { displayName } from "@/lib/trends/names";
import { getGameIcons } from "@/lib/roblox/thumbnails";
import { fmtDay, fmtInt } from "@/lib/format";
import { GameIcon } from "@/components/v2/GameIcon";
import { GenreChip } from "@/components/v2/GenreChip";

export const metadata: Metadata = {
  title: "Explore: Roblox Pulse",
  description: "Search every Roblox game tracked since May 2026 by name, studio, universe ID or Roblox link.",
};

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const query = parseSearch(q);
  const db = getSiteDb();

  let hits: SearchHit[] = [];
  let failed = false;
  if (query && db) {
    try {
      hits = await searchGames(db, query);
    } catch (err) {
      console.error("[explore] search failed:", err);
      failed = true;
    }
  }
  const icons = await getGameIcons(hits.slice(0, 50).map((h) => h.universeId));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-16 pt-9 md:px-6">
      <h1 className="font-heading text-5xl font-extrabold tracking-[-0.03em]">Explore</h1>
      <p className="text-text-2">Search every game tracked since May by name, studio, universe ID or a pasted Roblox link.</p>
      <form action="/explore" method="get" role="search" className="flex max-w-2xl flex-wrap gap-2">
        <label htmlFor="explore-search" className="sr-only">
          Search games
        </label>
        <input
          id="explore-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="e.g. Steal An Egg, Uplift Games, 10563114921"
          className="h-[52px] min-w-0 flex-[1_1_320px] rounded-[14px] border border-input bg-card px-4 text-[15px] outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <button type="submit" className="h-[52px] rounded-[14px] bg-rise px-6 font-bold text-background hover:brightness-110">
          Search
        </button>
      </form>

      {!query ? (
        <p className="text-sm text-muted-foreground">Filters, saved screens and CSV export are on the way.</p>
      ) : !db || failed ? (
        <p className="text-sm text-text-2">Search is temporarily unavailable. Please try again shortly.</p>
      ) : hits.length === 0 ? (
        <p className="text-sm text-text-2">
          No tracked games match &ldquo;{q}&rdquo;. We only know games that have appeared in Roblox&apos;s discovery lists.
        </p>
      ) : (
        <section aria-labelledby="results" className="flex flex-col gap-3">
          <h2 id="results" className="font-heading text-2xl font-bold">
            {hits.length === 50 ? "Top 50 matches" : `${hits.length} ${hits.length === 1 ? "match" : "matches"}`}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[640px] border-collapse text-sm tabular-nums">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 text-left font-medium">Game</th>
                  <th scope="col" className="px-2 py-3 text-left font-medium">Genre</th>
                  <th scope="col" className="px-2 py-3 text-right font-medium">7-day avg players</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((h) => {
                  const name = displayName(h.name);
                  return (
                    <tr key={h.universeId} className="border-t border-[#1b2028]">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium">
                        <span className="flex items-center gap-3">
                          <GameIcon url={icons.get(h.universeId)} name={name} size={40} />
                          <span className="min-w-0">
                            <Link href={`/games/${h.universeId}`} className="block hover:text-link">
                              {name}
                            </Link>
                            <span className="block text-xs font-normal text-muted-foreground">
                              {h.creatorName} · ID {h.universeId}
                            </span>
                          </span>
                        </span>
                      </th>
                      <td className="px-2 py-2.5">
                        <GenreChip genre={h.genre} />
                      </td>
                      <td className="px-2 py-2.5 text-right">{h.cur7 === null ? <span className="text-muted-foreground">—</span> : fmtInt(h.cur7)}</td>
                      <td className="px-4 py-2.5 text-right text-text-2">{fmtDay(h.lastSeenMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
