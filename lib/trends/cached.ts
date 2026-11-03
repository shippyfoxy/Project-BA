import { unstable_cache } from "next/cache";
import { getSiteDb } from "@/lib/db/site";
import { loadWeekAggregates, type AggRow } from "./game";
import { getActiveGames, type ActiveGames } from "./home";
import { getGenreTrends, type GenreTrends } from "./genreTrends";
import { getRevenuePage, type RevenuePage } from "./revenuePage";

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
  ["genre-trends-v3"],
  { revalidate: 3600 },
);


// The latest Top Earning list as [universeId, rank] pairs, for pages that add
// a rank column to games they already have.
export const getCachedEarningRanks = unstable_cache(
  async (): Promise<[number, number][]> => {
    const db = getSiteDb();
    if (!db) return [];
    const rows = await db.query<{ id: number; rank: number }>(
      `select universe_id::float8 as id, rank from earning_ranks where day = (select max(day) from earning_ranks)`,
    );
    return rows.map((r) => [r.id, r.rank]);
  },
  ["earning-ranks-v1"],
  { revalidate: 3600 },
);

// The Top Earning list with modelled revenue, for the Revenue page.
export const getCachedRevenuePage = unstable_cache(
  async (): Promise<RevenuePage | null> => {
    const db = getSiteDb();
    return db ? getRevenuePage(db) : null;
  },
  ["revenue-page-v1"],
  { revalidate: 3600 },
);
