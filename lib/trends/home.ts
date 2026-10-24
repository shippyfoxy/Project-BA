import type { Db } from "@/lib/db/client";
import { lifecycleStage, STAGES, type Stage } from "./stage";

const DAY_MS = 86_400_000;

// Games below this 7-day average are too small to rank or classify reliably.
export const ACTIVE_MIN_PLAYERS = 1_000;
// Movers must have had this many players the week before, so a jump from
// 50 to 500 does not top the chart.
const MOVER_MIN_PREV = 3_000;

export interface HomeGame {
  universeId: number;
  name: string;
  creatorName: string;
  genre: string;
  canonicalUrlPath: string | null;
  cur7: number;
  prev7: number | null;
  peak7: number;
  wowPct: number | null;
  stage: Stage;
}

export interface Mover extends HomeGame {
  spark: number[]; // daily average players, oldest first
}

export interface TrendsHome {
  asOfMs: number;
  weekFrom: string;
  weekTo: string;
  gamesTracked: number;
  daysOfHistory: number;
  readings: number;
  playingNow: number;
  gamesNow: number;
  activeGames: number;
  stageCounts: Record<Stage, number>;
  top: HomeGame[];
  risers: Mover[];
  fallers: Mover[];
  records: {
    biggestReading: { name: string; players: number; atMs: number } | null;
    fastestToMillion: { name: string; days: number } | null;
    alwaysTop10: { names: string[]; days: number };
    biggestShare: { name: string; pct: number; weekStart: string } | null;
  };
  rhythm: { dow: number; index: number }[]; // 1 = Monday, 100 = weekly average
  studios: { name: string; players: number; topGame: string; bigGames: number }[];
  studiosWithSeveralHits: number;
}

// Rolling 7-day average per game and day, the basis for peaks.
const ROLL = `
  roll as (
    select universe_id, day, playing_avg,
      avg(playing_avg) over (partition by universe_id order by day
        range between interval '6 days' preceding and current row) as r7
    from game_daily
  )`;

interface GameRow {
  universe_id: number;
  name: string;
  creator_name: string | null;
  genre: string;
  canonical_url_path: string | null;
  cur7: number;
  prev7: number | null;
  peak7: number;
  days_tracked: number;
  created_ms: number | null;
  days_to_1m: number | null;
}

export async function getTrendsHome(db: Db): Promise<TrendsHome | null> {
  const [latest] = await db.query<{ as_of_ms: number | null; day: string | null }>(
    `select extract(epoch from max(ts))::float8 * 1000 as as_of_ms,
            ((max(ts) at time zone 'UTC')::date)::text as day
     from snapshots`,
  );
  if (!latest?.as_of_ms || !latest.day) return null;
  const day = latest.day;

  const [totals] = await db.query<{ games: number; days: number; readings: number }>(
    `select (select count(*) from games)::int as games,
            count(distinct day)::int as days,
            coalesce(sum(samples), 0)::float8 as readings
     from game_daily`,
  );
  const [now] = await db.query<{ n: number; total: number }>(
    `select count(*)::int as n, coalesce(sum(playing), 0)::float8 as total
     from observations where ts = (select max(ts) from snapshots)`,
  );

  const rows = await db.query<GameRow>(
    `with ${ROLL},
     agg as (
       select universe_id,
         avg(playing_avg) filter (where day > $1::date - 7) as cur7,
         avg(playing_avg) filter (where day <= $1::date - 7 and day > $1::date - 14) as prev7,
         max(r7) as peak7,
         count(*) as days_tracked,
         min(day) filter (where r7 >= 1000000) as d1m
       from roll group by universe_id
     )
     select a.universe_id::float8 as universe_id, g.name, g.creator_name,
            coalesce(g.genre_l1, 'Other') as genre, g.canonical_url_path,
            coalesce(a.cur7, 0)::float8 as cur7, a.prev7::float8 as prev7, a.peak7::float8 as peak7,
            a.days_tracked::int as days_tracked,
            extract(epoch from g.created_at)::float8 * 1000 as created_ms,
            -- Days from creation to a 1M 7-day average, only for launches we saw
            -- from the start (created after tracking began, seen within 14 days).
            case when g.created_at >= (select min(day) from game_daily)
                  and g.first_seen::date - g.created_at::date <= 14
                 then (a.d1m - g.created_at::date) end::int as days_to_1m
     from agg a join games g using (universe_id)
     where a.cur7 >= $2 or a.d1m is not null`,
    [day, ACTIVE_MIN_PLAYERS],
  );
  const activeRows = rows.filter((r) => r.cur7 >= ACTIVE_MIN_PLAYERS);
  const fastest = rows
    .filter((r) => r.days_to_1m !== null)
    .sort((a, b) => a.days_to_1m! - b.days_to_1m!)[0];

  const asOfMs = latest.as_of_ms;
  const games: HomeGame[] = activeRows.map((r) => ({
    universeId: r.universe_id,
    name: r.name,
    creatorName: r.creator_name ?? "Unknown",
    genre: r.genre,
    canonicalUrlPath: r.canonical_url_path,
    cur7: r.cur7,
    prev7: r.prev7,
    // A game's best week can never be below this week's average.
    peak7: Math.max(r.peak7, r.cur7),
    wowPct: r.prev7 ? (100 * (r.cur7 - r.prev7)) / r.prev7 : null,
    stage: lifecycleStage({
      cur7: r.cur7,
      prev7: r.prev7,
      peak7: Math.max(r.peak7, r.cur7),
      createdMs: r.created_ms,
      daysTracked: r.days_tracked,
      nowMs: asOfMs,
    }),
  }));

  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const g of games) stageCounts[g.stage]++;

  const byPlayers = [...games].sort((a, b) => b.cur7 - a.cur7);
  const movers = games.filter((g) => g.prev7 !== null && g.prev7 >= MOVER_MIN_PREV && g.wowPct !== null);
  movers.sort((a, b) => b.wowPct! - a.wowPct!);
  const risers = movers.slice(0, 4).filter((g) => g.wowPct! > 0);
  const fallers = movers.slice(-4).reverse().filter((g) => g.wowPct! < 0);

  const sparkIds = [...risers, ...fallers].map((g) => g.universeId);
  const sparkRows = sparkIds.length
    ? await db.query<{ universe_id: number; v: number }>(
        `select universe_id::float8 as universe_id, playing_avg::float8 as v from game_daily
         where universe_id in (select unnest(string_to_array($1, ','))::bigint)
           and day > $2::date - 30
         order by universe_id, day`,
        [sparkIds.join(","), day],
      )
    : [];
  const sparks = new Map<number, number[]>();
  for (const r of sparkRows) sparks.set(r.universe_id, [...(sparks.get(r.universe_id) ?? []), r.v]);
  const withSpark = (g: HomeGame): Mover => ({ ...g, spark: sparks.get(g.universeId) ?? [] });

  const [biggest] = await db.query<{ name: string; v: number; at_ms: number }>(
    `select g.name, d.playing_max::float8 as v, extract(epoch from d.playing_max_at)::float8 * 1000 as at_ms
     from game_daily d join games g using (universe_id) order by d.playing_max desc limit 1`,
  );
  const alwaysTop10 = await db.query<{ name: string }>(
    `with ranked as (
       select day, universe_id, row_number() over (partition by day order by playing_avg desc) as rn from game_daily
     )
     select g.name from ranked r join games g using (universe_id)
     where rn <= 10 group by g.universe_id, g.name
     having count(*) = (select count(distinct day) from game_daily)
     order by g.name`,
  );
  const [share] = await db.query<{ name: string; pct: number; wk: string }>(
    `with w as (select date_trunc('week', day)::date as wk, universe_id, avg(playing_avg) as p from game_daily group by 1, 2),
          t as (select wk, sum(p) as tot from w group by wk)
     select g.name, (100 * w.p / t.tot)::float8 as pct, w.wk::text as wk
     from w join t using (wk) join games g using (universe_id)
     order by w.p / t.tot desc limit 1`,
  );

  // Complete days only: today's total is still filling in.
  const rhythmRows = await db.query<{ dow: number; avg: number }>(
    `with t as (select day, sum(playing_avg) as tot from game_daily
                where day < $1::date and day >= $1::date - 140 group by day)
     select extract(isodow from day)::int as dow, avg(tot)::float8 as avg from t group by 1 order by 1`,
    [day],
  );
  const rhythmMean = rhythmRows.reduce((a, r) => a + r.avg, 0) / Math.max(rhythmRows.length, 1);

  const studioMap = new Map<string, { players: number; top: HomeGame; bigGames: number }>();
  for (const g of byPlayers) {
    const s = studioMap.get(g.creatorName);
    if (s) {
      s.players += g.cur7;
      if (g.cur7 >= 10_000) s.bigGames++;
    } else {
      studioMap.set(g.creatorName, { players: g.cur7, top: g, bigGames: g.cur7 >= 10_000 ? 1 : 0 });
    }
  }
  const studioList = [...studioMap.entries()]
    .map(([name, s]) => ({ name, players: s.players, topGame: s.top.name, bigGames: s.bigGames }))
    .sort((a, b) => b.players - a.players);

  return {
    asOfMs,
    weekFrom: new Date(Date.parse(day) - 6 * DAY_MS).toISOString().slice(0, 10),
    weekTo: day,
    gamesTracked: totals.games,
    daysOfHistory: totals.days,
    readings: totals.readings,
    playingNow: now.total,
    gamesNow: now.n,
    activeGames: games.length,
    stageCounts,
    top: byPlayers.slice(0, 8),
    risers: risers.map(withSpark),
    fallers: fallers.map(withSpark),
    records: {
      biggestReading: biggest ? { name: biggest.name, players: biggest.v, atMs: biggest.at_ms } : null,
      fastestToMillion: fastest ? { name: fastest.name, days: fastest.days_to_1m! } : null,
      alwaysTop10: { names: alwaysTop10.map((r) => r.name), days: totals.days },
      biggestShare: share ? { name: share.name, pct: share.pct, weekStart: share.wk } : null,
    },
    rhythm: rhythmRows.map((r) => ({ dow: r.dow, index: (100 * r.avg) / rhythmMean })),
    studios: studioList.slice(0, 5),
    studiosWithSeveralHits: studioList.filter((s) => s.bigGames >= 2).length,
  };
}
