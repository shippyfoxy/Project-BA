import type { Db } from "@/lib/db/client";
import { estMonthlyDevEx } from "./revenue";

export interface RankedGame {
  universeId: number;
  name: string;
  creatorName: string;
  genre: string;
  rank: number;
  prevRank: number | null; // on the previous recorded day; null if not listed then
  estMonthly: number; // MODELLED, from rank
  cur7: number | null; // 7-day average players
}

export interface RevenuePage {
  listDay: string;
  prevDay: string | null;
  games: RankedGame[];
  totalEst: number;
  medianEst: number;
}

// Roblox's Top Earning list on the latest recorded day, with each game's rank
// the day before and its 7-day average players.
export async function getRevenuePage(db: Db): Promise<RevenuePage | null> {
  const [days] = await db.query<{ latest: string | null; prev: string | null }>(
    `select max(day)::text as latest,
            (select max(day) from earning_ranks where day < (select max(day) from earning_ranks))::text as prev
     from earning_ranks`,
  );
  if (!days?.latest) return null;

  const rows = await db.query<{
    universe_id: number;
    name: string;
    creator_name: string | null;
    genre: string;
    rank: number;
    prev_rank: number | null;
    cur7: number | null;
  }>(
    `select e.universe_id::float8 as universe_id, g.name, g.creator_name, coalesce(g.genre_l1, 'Other') as genre,
            e.rank, p.rank as prev_rank,
            (select avg(d.playing_avg) from game_daily d
              where d.universe_id = e.universe_id
                and d.day > (select max(day) from game_daily) - 7)::float8 as cur7
     from earning_ranks e
     join games g using (universe_id)
     left join earning_ranks p on p.universe_id = e.universe_id and p.day = $2::date
     where e.day = $1::date
     order by e.rank`,
    [days.latest, days.prev],
  );

  const games = rows.map((r) => ({
    universeId: r.universe_id,
    name: r.name,
    creatorName: r.creator_name ?? "Unknown",
    genre: r.genre,
    rank: r.rank,
    prevRank: r.prev_rank,
    estMonthly: estMonthlyDevEx(r.rank)!.mid,
    cur7: r.cur7,
  }));
  const sorted = games.map((g) => g.estMonthly).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    listDay: days.latest,
    prevDay: days.prev,
    games,
    totalEst: sorted.reduce((a, b) => a + b, 0),
    medianEst: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
  };
}
