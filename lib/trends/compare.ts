import type { Db } from "@/lib/db/client";
import { MIN_PEAK_DAYS } from "@/lib/db/ingest";
import { EARNING_WEEK } from "./revenue";

const DAY_MS = 86_400_000;
export const MAX_COMPARE = 4;
// Validated together for colour blindness; assigned by position, never cycled.
export const COMPARE_COLORS = ["#4A8BE8", "#c98500", "#199e70", "#9085e9"] as const;

export interface CompareGame {
  universeId: number;
  name: string;
  genre: string;
  createdMs: number | null;
  firstDayMs: number;
  points: { dayMs: number; r7: number }[]; // 7-day average, oldest first
  peak: { dayMs: number; r7: number };
  latest: { dayMs: number; r7: number };
  earningRank: number | null; // latest Top Earning list
  earningEffRank: number | null; // over the last 7 lists; estimates come from this
}

export function parseIds(raw: string | string[] | undefined): number[] {
  const s = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return [...new Set(s.split(",").map((v) => v.trim()).filter((v) => /^\d{1,20}$/.test(v)).map(Number))].slice(0, MAX_COMPARE);
}

// The biggest launches we saw from the start, so their whole rise is on record.
export async function defaultCompareIds(db: Db): Promise<number[]> {
  const rows = await db.query<{ id: number }>(
    `select p.universe_id::float8 as id
     from game_peaks p join games g using (universe_id)
     where g.created_at >= (select min(day) from game_daily)
       and g.first_seen::date - g.created_at::date <= 21
     order by p.peak7 desc
     limit ${MAX_COMPARE}`,
  );
  return rows.map((r) => r.id);
}

export async function getCompareGames(db: Db, ids: number[]): Promise<CompareGame[]> {
  if (ids.length === 0) return [];
  const list = ids.join(",");
  const [games, rows] = await Promise.all([
    db.query<{ universe_id: number; name: string; genre: string; created_ms: number | null; earning_rank: number | null; earning_eff_rank: number | null }>(
      `with ${EARNING_WEEK}
       select universe_id::float8 as universe_id, name, coalesce(genre_l1, 'Other') as genre,
              extract(epoch from created_at)::float8 * 1000 as created_ms,
              (select rank from earning_ranks e where e.universe_id = games.universe_id
                 and e.day = (select max(day) from earning_ranks)) as earning_rank,
              (select eff_rank from earning_week w where w.universe_id = games.universe_id) as earning_eff_rank
       from games where universe_id in (select unnest(string_to_array($1, ','))::bigint)`,
      [list],
    ),
    // The same calendar 7-day windows as game_peaks, complete days only, so
    // peaks here match game pages.
    db.query<{ universe_id: number; day_ms: number; r7: number; days: number }>(
      `select universe_id::float8 as universe_id, extract(epoch from day)::float8 * 1000 as day_ms,
              avg(playing_avg) over w::float8 as r7, count(*) over w::int as days
       from game_daily
       where universe_id in (select unnest(string_to_array($1, ','))::bigint)
         and day < (select max(day) from game_daily)
       window w as (partition by universe_id order by day range between interval '6 days' preceding and current row)
       order by universe_id, day`,
      [list],
    ),
  ]);
  const byId = new Map(games.map((g) => [g.universe_id, g]));
  const out: CompareGame[] = [];
  for (const id of ids) {
    const g = byId.get(id);
    const own = rows.filter((r) => r.universe_id === id);
    const points = own.map((r) => ({ dayMs: r.day_ms, r7: r.r7 }));
    if (!g || points.length === 0) continue;
    // A peak needs a full window (MIN_PEAK_DAYS+ days of readings) when one exists.
    const full = own.filter((r) => r.days >= MIN_PEAK_DAYS);
    const best = (full.length ? full : own).reduce((a, b) => (b.r7 > a.r7 ? b : a));
    const peak = { dayMs: best.day_ms, r7: best.r7 };
    out.push({
      universeId: id,
      name: g.name,
      genre: g.genre,
      createdMs: g.created_ms,
      firstDayMs: points[0].dayMs,
      points,
      peak,
      latest: points[points.length - 1],
      earningRank: g.earning_rank,
      earningEffRank: g.earning_eff_rank,
    });
  }
  return out;
}

// Days since creation, counting the creation day as day 0.
export const daysSince = (createdMs: number | null, dayMs: number) =>
  createdMs === null ? null : Math.floor(dayMs / DAY_MS) - Math.floor(createdMs / DAY_MS);
