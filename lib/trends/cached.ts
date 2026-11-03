import { unstable_cache } from "next/cache";
import { getSiteDb } from "@/lib/db/site";
import { loadWeekAggregates, type AggRow } from "./game";
import { getActiveGames, type ActiveGames } from "./home";
import { getGenreTrends, type GenreTrends } from "./genreTrends";

// Shared across every game page and refreshed at most hourly, so opening a
// game for the first time doesn't recompute every game's week.
export const getCachedWeekAggregates = unstable_cache(
  async (day: string): Promise<AggRow[]> => {
    const db = getSiteDb();
    return db ? loadWeekAggregates(db, day) : [];
  },
  ["week-aggregates-v1"],
  { revalidate: 3600 },
);

// Every active game with its stage, shared by the home page and the seven
// stage pages so their counts match.
export const getCachedActiveGames = unstable_cache(
  async (): Promise<ActiveGames | null> => {
    const db = getSiteDb();
    return db ? getActiveGames(db) : null;
  },
  ["active-games-v1"],
  { revalidate: 3600 },
);

// Weekly genre shares and market concentration over the whole history.
export const getCachedGenreTrends = unstable_cache(
  async (): Promise<GenreTrends | null> => {
    const db = getSiteDb();
    return db ? getGenreTrends(db) : null;
  },
  ["genre-trends-v1"],
  { revalidate: 3600 },
);

// When the data was last refreshed, for the header on every page.
export const getCachedLatestRefresh = unstable_cache(
  async (): Promise<number | null> => {
    const db = getSiteDb();
    if (!db) return null;
    const [r] = await db.query<{ ms: number | null }>(`select extract(epoch from max(ts))::float8 * 1000 as ms from snapshots`);
    return r?.ms ?? null;
  },
  ["latest-refresh-v1"],
  { revalidate: 900 },
);
