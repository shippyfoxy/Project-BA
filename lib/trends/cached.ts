import { unstable_cache } from "next/cache";
import { getSiteDb } from "@/lib/db/site";
import { loadWeekAggregates, type AggRow } from "./game";
import { getActiveGames, type ActiveGames } from "./home";
import { getGenreTrends, type GenreTrends } from "./genreTrends";
import { getRevenuePage, type RevenuePage } from "./revenuePage";
import { getUpdateImpact, type UpdateImpact } from "./updates";
import { getLaunchCurves, type LaunchCurves } from "./launches";
import { getIdeas, type Ideas } from "./ideas";
import { EARNING_WEEK } from "./revenue";

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


// The latest Top Earning list as [universeId, rank, effective rank] rows, for
// pages that add a rank column to games they already have.
export const getCachedEarningRanks = unstable_cache(
  async (): Promise<[number, number, number][]> => {
    const db = getSiteDb();
    if (!db) return [];
    const rows = await db.query<{ id: number; rank: number; eff_rank: number }>(
      `with ${EARNING_WEEK}
       select universe_id::float8 as id, rank, w.eff_rank from earning_ranks join earning_week w using (universe_id)
       where day = (select max(day) from earning_ranks)`,
    );
    return rows.map((r) => [r.id, r.rank, r.eff_rank]);
  },
  ["earning-ranks-v2"],
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

// Update impact across every game since May: a heavy query, refreshed hourly.
export const getCachedUpdateImpact = unstable_cache(
  async (): Promise<UpdateImpact | null> => {
    const db = getSiteDb();
    return db ? getUpdateImpact(db) : null;
  },
  ["update-impact-v1"],
  { revalidate: 3600 },
);

// Launch percentile curves, per genre: a heavy query over every launch since
// May, and the curves move slowly, so a few hours is fresh enough.
export const getCachedLaunchCurves = unstable_cache(
  async (genre: string | null): Promise<LaunchCurves | null> => {
    const db = getSiteDb();
    return db ? getLaunchCurves(db, genre) : null;
  },
  ["launch-curves-v2"],
  { revalidate: 3 * 3600 },
);

// Name patterns and genre signals for the Ideas page, per genre, hourly.
export const getCachedIdeas = unstable_cache(
  async (genre: string | null): Promise<Ideas | null> => {
    const db = getSiteDb();
    return db ? getIdeas(db, genre) : null;
  },
  ["ideas-v3"],
  { revalidate: 3600 },
);
