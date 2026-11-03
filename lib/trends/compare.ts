import type { Db } from "@/lib/db/client";

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
    db.query<{ universe_id: number; name: string; genre: string; created_ms: number | null }>(
      `select universe_id::float8 as universe_id, name, coalesce(genre_l1, 'Other') as genre,
              extract(epoch from created_at)::float8 * 1000 as created_ms
       from games where universe_id in (select unnest(string_to_array($1, ','))::bigint)`,
      [list],
    ),
    // The same calendar 7-day window as game_peaks, so peaks here match game pages.
    db.query<{ universe_id: number; day_ms: number; r7: number }>(
      `select universe_id::float8 as universe_id, extract(epoch from day)::float8 * 1000 as day_ms,
              avg(playing_avg) over (partition by universe_id order by day
                range between interval '6 days' preceding and current row)::float8 as r7
       from game_daily
       where universe_id in (select unnest(string_to_array($1, ','))::bigint)
       order by universe_id, day`,
      [list],
    ),
  ]);
  const byId = new Map(games.map((g) => [g.universe_id, g]));
  const out: CompareGame[] = [];
  for (const id of ids) {
    const g = byId.get(id);
    const points = rows.filter((r) => r.universe_id === id).map((r) => ({ dayMs: r.day_ms, r7: r.r7 }));
    if (!g || points.length === 0) continue;
    const peak = points.reduce((a, b) => (b.r7 > a.r7 ? b : a));
    out.push({
      universeId: id,
      name: g.name,
      genre: g.genre,
      createdMs: g.created_ms,
      firstDayMs: points[0].dayMs,
      points,
      peak,
      latest: points[points.length - 1],
    });
  }
  return out;
}

// Days since creation, counting the creation day as day 0.
export const daysSince = (createdMs: number | null, dayMs: number) =>
  createdMs === null ? null : Math.floor(dayMs / DAY_MS) - Math.floor(createdMs / DAY_MS);
