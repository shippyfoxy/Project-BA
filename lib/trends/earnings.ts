import type { Db } from "@/lib/db/client";
import { EARNING_WEEK } from "./revenue";

export interface EarningRanks {
  latest: { dayMs: number; rank: number; effRank: number } | null; // null when not in the most recent list
  best: { dayMs: number; rank: number } | null;
  listDayMs: number | null; // the most recent day any list was recorded
}

// A game's place in Roblox's Top Earning list: today's rank if it is in the
// latest list, and its best rank since we started recording them.
export async function getEarningRanks(db: Db, universeId: number): Promise<EarningRanks> {
  const [r] = await db.query<{ list_ms: number | null; latest_rank: number | null; eff_rank: number | null; best_rank: number | null; best_ms: number | null }>(
    `with ${EARNING_WEEK},
          mine as (select day, rank from earning_ranks where universe_id = $1::bigint),
          list as (select max(day) as day from earning_ranks)
     select extract(epoch from list.day)::float8 * 1000 as list_ms,
            (select rank from mine where day = list.day) as latest_rank,
            (select eff_rank from earning_week where universe_id = $1::bigint) as eff_rank,
            (select rank from mine order by rank, day desc limit 1) as best_rank,
            (select extract(epoch from day)::float8 * 1000 from mine order by rank, day desc limit 1) as best_ms
     from list`,
    [universeId],
  );
  if (!r?.list_ms) return { latest: null, best: null, listDayMs: null };
  return {
    latest: r.latest_rank ? { dayMs: r.list_ms, rank: r.latest_rank, effRank: r.eff_rank ?? r.latest_rank } : null,
    best: r.best_rank && r.best_ms ? { dayMs: r.best_ms, rank: r.best_rank } : null,
    listDayMs: r.list_ms,
  };
}
