import { getSiteDb } from "@/lib/db/site";
import { renderRss } from "@/lib/feeds";
import { getCachedGenreTrends, getCachedHitLives } from "@/lib/trends/cached";
import { getWatch, parseWatch, watchQuery } from "@/lib/trends/watch";

export const maxDuration = 30;

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const list = parseWatch({ g: p.get("g"), s: p.get("s"), sub: p.get("sub") });
  const db = getSiteDb();
  const empty = !list.games.length && !list.studios.length && !list.subgenres.length;
  const items =
    db && !empty
      ? await Promise.all([getCachedHitLives().catch(() => []), getCachedGenreTrends().catch(() => null)])
          .then(([hitLives, trends]) => getWatch(db, list, { hitLives, subgenres: trends?.subgenres ?? [] }))
          .then((w) => w.events)
          .catch(() => [])
      : [];
  return new Response(
    renderRss(
      {
        title: "Roblox Pulse: my watchlist",
        path: `/feeds/watch.xml?${watchQuery(list)}`,
        description: "Changes to the Roblox games and studios on this watchlist: big weekly moves, best weeks, updates, falls and new games.",
      },
      items,
    ),
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" } },
  );
}
