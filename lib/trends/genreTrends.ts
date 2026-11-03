import type { Db } from "@/lib/db/client";
import { quantile } from "@/lib/stats";
import type { AggRow } from "./game";

const DAY_MS = 86_400_000;

// Weeks are the 7-day windows ending on the latest day, so the newest point
// matches the "this week" figures everywhere else on the site.
export interface WeekPoint {
  endMs: number;
  share: number;
}

export interface GenreShare {
  genre: string;
  games: number; // with readings this week
  players: number; // average concurrent players across the genre this week
  share: number;
  mayShare: number | null;
  weeks: WeekPoint[];
}

export interface Concentration {
  weeks: { endMs: number; top10: number; top1: number; topId: number; topName: string }[];
}

export interface GenreBenchmark {
  genre: string;
  n: number;
  p50: number;
  p90: number;
  p99: number | null; // only with 100+ games; below that it is just the biggest game
  session: { n: number; p25: number; p50: number; p75: number; p90: number } | null;
}

export interface GenreTrends {
  latestDay: string;
  shares: GenreShare[];
  concentration: Concentration;
}

export async function getGenreTrends(db: Db): Promise<GenreTrends | null> {
  const [latest] = await db.query<{ day: string | null }>(`select max(day)::text as day from game_daily`);
  if (!latest?.day) return null;
  const day = latest.day;
  const endMs = (wk: number) => Date.parse(day) - wk * 7 * DAY_MS;

  const [weekly, may, games, conc] = await Promise.all([
    db.query<{ wk: number; genre: string; s: number; days: number }>(
      `select ($1::date - d.day) / 7 as wk, coalesce(g.genre_l1, 'Other') as genre,
              sum(d.playing_avg)::float8 as s, count(distinct d.day)::int as days
       from game_daily d join games g using (universe_id)
       group by 1, 2`,
      [day],
    ),
    db.query<{ genre: string; s: number }>(
      `select coalesce(g.genre_l1, 'Other') as genre, sum(d.playing_avg)::float8 as s
       from game_daily d join games g using (universe_id)
       where d.day >= '2026-05-01' and d.day < '2026-06-01'
       group by 1`,
    ),
    db.query<{ genre: string; n: number }>(
      `select coalesce(g.genre_l1, 'Other') as genre, count(distinct d.universe_id)::int as n
       from game_daily d join games g using (universe_id)
       where d.day > $1::date - 7
       group by 1`,
      [day],
    ),
    db.query<{ wk: number; top10: number; top1: number; top_id: number; top_name: string }>(
      `with r as (
         select day, universe_id, playing_avg,
                row_number() over (partition by day order by playing_avg desc) as rn,
                sum(playing_avg) over (partition by day) as tot
         from game_daily
       ), daily as (
         select day, max(tot) as tot,
                sum(playing_avg) filter (where rn <= 10) as s10,
                max(playing_avg) filter (where rn = 1) as s1,
                max(universe_id) filter (where rn = 1) as top
         from r where rn <= 10 group by day
       ), weekly as (
         select ($1::date - day) / 7 as wk, avg(s10 / tot) as top10, avg(s1 / tot) as top1,
                mode() within group (order by top) as top, count(*) as days
         from daily group by 1
       )
       select w.wk, w.top10::float8 as top10, w.top1::float8 as top1, w.top::float8 as top_id, g.name as top_name
       from weekly w join games g on g.universe_id = w.top
       where w.days >= 4
       order by w.wk desc`,
      [day],
    ),
  ]);

  // Drop the oldest window if it is mostly before tracking began.
  const weekDays = new Map<number, number>();
  for (const r of weekly) weekDays.set(r.wk, Math.max(weekDays.get(r.wk) ?? 0, r.days));
  const totals = new Map<number, number>();
  for (const r of weekly) if ((weekDays.get(r.wk) ?? 0) >= 4) totals.set(r.wk, (totals.get(r.wk) ?? 0) + r.s);
  const mayTotal = may.reduce((a, r) => a + r.s, 0);
  const mayBy = new Map(may.map((r) => [r.genre, r.s]));
  const gamesBy = new Map(games.map((r) => [r.genre, r.n]));

  const byGenre = new Map<string, Map<number, number>>();
  for (const r of weekly) {
    if (!totals.has(r.wk)) continue;
    const m = byGenre.get(r.genre) ?? new Map<number, number>();
    m.set(r.wk, r.s);
    byGenre.set(r.genre, m);
  }
  const wks = [...totals.keys()].sort((a, b) => b - a);
  const shares: GenreShare[] = [...byGenre].map(([genre, m]) => {
    const now = m.get(0) ?? 0;
    return {
      genre,
      games: gamesBy.get(genre) ?? 0,
      players: now / Math.max(weekDays.get(0) ?? 7, 1),
      share: now / (totals.get(0) || 1),
      mayShare: mayTotal ? (mayBy.get(genre) ?? 0) / mayTotal : null,
      weeks: wks.map((wk) => ({ endMs: endMs(wk), share: (m.get(wk) ?? 0) / totals.get(wk)! })),
    };
  });
  shares.sort((a, b) => b.share - a.share);

  return {
    latestDay: day,
    shares,
    concentration: {
      weeks: conc.map((r) => ({ endMs: endMs(r.wk), top10: r.top10, top1: r.top1, topId: r.top_id, topName: r.top_name })),
    },
  };
}

// Percentiles across games averaging 1,000+ players this week, from the same
// week aggregates the game pages use, so a game's genre rank matches.
export function genreBenchmarks(rows: AggRow[], minGames = 10): { all: GenreBenchmark; genres: GenreBenchmark[] } {
  const active = rows.filter((r) => r.cur7 !== null && r.cur7 >= 1_000);
  const bench = (genre: string, list: AggRow[]): GenreBenchmark => {
    const players = list.map((r) => r.cur7!).sort((a, b) => a - b);
    const sessions = list.map((r) => r.session).filter((s): s is number => s !== null && s > 0).sort((a, b) => a - b);
    return {
      genre,
      n: list.length,
      p50: quantile(players, 0.5),
      p90: quantile(players, 0.9),
      p99: list.length >= 100 ? quantile(players, 0.99) : null,
      session:
        sessions.length >= 5
          ? { n: sessions.length, p25: quantile(sessions, 0.25), p50: quantile(sessions, 0.5), p75: quantile(sessions, 0.75), p90: quantile(sessions, 0.9) }
          : null,
    };
  };
  const groups = new Map<string, AggRow[]>();
  for (const r of active) groups.set(r.genre, [...(groups.get(r.genre) ?? []), r]);
  const genres = [...groups]
    .filter(([, list]) => list.length >= minGames)
    .map(([g, list]) => bench(g, list))
    .sort((a, b) => b.n - a.n);
  return { all: bench("All genres", active), genres };
}
