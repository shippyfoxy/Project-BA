import type { Db } from "@/lib/db/client";

// "Is my launch on track?" Day 0 is the first day a game reached Roblox's
// discovery lists (the day we first have a reading), not its creation date:
// studios often create a game months before they publish it. Only games
// created since tracking began count, and only if they reached the lists
// within 60 days of creation, so this is new games breaking through, not old
// ones resurfacing.
//
// Since 24 October every known game is checked at least daily and readings are
// only skipped when nobody is playing, so a day with no reading is a day with
// zero players. Before then a game was only read while it was in the lists, so
// a missing day says nothing. The curves therefore use only days from
// 24 October: day 3 comes from launches whose third day fell after it, day 60
// from those whose sixtieth did. Which games count is fixed at launch, so
// this leaves out no failures.
export const LAUNCHES_FROM = "2026-05-08";
export const COMPLETE_FROM = "2026-10-24";
export const MAX_DAY = 90;
export const MAX_START_AGE_DAYS = 60;
export const MIN_GAMES = 30;

// Every 5th percentile from 5 to 95, so a game's standing can be placed
// between two of them.
export const QUANTILES = Array.from({ length: 19 }, (_, i) => (i + 1) / 20);
const at = (p: number) => QUANTILES.findIndex((q) => Math.abs(q - p) < 1e-9);
export const Q = { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) };

export interface LaunchDay {
  day: number;
  games: number;
  playing: number; // games with any players that day
  q: number[]; // players at each of QUANTILES
}

export interface LaunchCurves {
  genre: string | null;
  cohort: number; // games in the comparison
  days: LaunchDay[]; // days with at least MIN_GAMES games
  genres: { genre: string; games: number }[]; // for the genre picker
}

export interface LaunchGame {
  universeId: number;
  name: string;
  genre: string;
  startMs: number; // day 0
  points: [number, number][]; // [day, players]
}

const COHORT = `
  last as (select (max(ts) at time zone 'UTC')::date - 1 as day from snapshots),
  cohort as (
    select g.universe_id, coalesce(g.genre_l1, 'Other') as genre, min(d.day) as d0
    from games g join game_daily d using (universe_id)
    where g.created_at >= '${LAUNCHES_FROM}'::date
    group by g.universe_id, g.genre_l1, g.created_at
    having min(d.day) - (g.created_at at time zone 'UTC')::date <= ${MAX_START_AGE_DAYS}),
  grid as (
    select c.universe_id, c.genre, s.day::date as day, s.day::date - c.d0 as n, coalesce(d.playing_avg, 0) as players
    from cohort c cross join last
    cross join lateral generate_series(c.d0, least(c.d0 + ${MAX_DAY}, last.day), interval '1 day') s(day)
    left join game_daily d on d.universe_id = c.universe_id and d.day = s.day::date
    where d.day is not null or s.day >= '${COMPLETE_FROM}'::date)`;

export async function getLaunchCurves(db: Db, genre: string | null): Promise<LaunchCurves> {
  const [days, genres] = await Promise.all([
    db.query<{ n: number; games: number; playing: number; q: number[] }>(
      `with ${COHORT}
       select n, count(*)::int as games, count(*) filter (where players > 0)::int as playing,
              percentile_cont(array[${QUANTILES.join(",")}]::float8[]) within group (order by players) as q
       from grid
       where ($1::text is null or genre = $1)
         and day >= '${COMPLETE_FROM}'::date
       group by n order by n`,
      [genre],
    ),
    db.query<{ genre: string; games: number }>(
      `with ${COHORT} select genre, count(*)::int as games from cohort group by genre order by games desc`,
    ),
  ]);
  const kept = days.filter((d) => d.games >= MIN_GAMES);
  return {
    genre,
    cohort: genres.filter((g) => genre === null || g.genre === genre).reduce((a, g) => a + g.games, 0),
    days: kept.map((d) => ({ day: d.n, games: d.games, playing: d.playing, q: d.q.map(Number) })),
    genres,
  };
}

// One game's first 90 days, or null if it is not a launch we can compare.
// Days before 24 October appear only where the game has a reading.
export async function getLaunchGame(db: Db, universeId: number): Promise<LaunchGame | null> {
  const rows = await db.query<{ name: string; genre: string; d0: string; n: number; players: number }>(
    `with ${COHORT}
     select g.name, gr.genre, c.d0::text as d0, gr.n, gr.players::float8 as players
     from grid gr join cohort c using (universe_id) join games g using (universe_id)
     where gr.universe_id = $1::bigint
     order by gr.n`,
    [universeId],
  );
  if (!rows.length) return null;
  return {
    universeId,
    name: rows[0].name,
    genre: rows[0].genre,
    startMs: Date.parse(rows[0].d0),
    points: rows.map((r) => [r.n, r.players]),
  };
}

// The share of launches a game was ahead of on one day, by interpolating
// between the 5% steps. Ties at zero count as level, not ahead.
export function standing(q: number[], players: number): number {
  if (players <= 0) return 0;
  if (players < q[0]) return q[0] > 0 ? (QUANTILES[0] * players) / q[0] : QUANTILES[0];
  for (let i = q.length - 1; i >= 0; i--) {
    if (players < q[i]) continue;
    if (i === q.length - 1 || q[i + 1] === q[i]) return QUANTILES[i];
    return QUANTILES[i] + ((players - q[i]) / (q[i + 1] - q[i])) * (QUANTILES[i + 1] - QUANTILES[i]);
  }
  return 0;
}
