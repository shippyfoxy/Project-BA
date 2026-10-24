import { unstable_cache } from "next/cache";
import { getSiteDb } from "@/lib/db/site";
import { loadWeekAggregates, type AggRow } from "./game";

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
