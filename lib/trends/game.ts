import type { Db } from "@/lib/db/client";
import { quantile, shareBelow } from "@/lib/stats";
import { ACTIVE_MIN_PLAYERS } from "./home";
import { lifecycleStage, type Stage } from "./stage";

export interface DailyPoint {
  dayMs: number;
  avg: number; // daily average concurrent players
  r7: number; // 7-day rolling average
  max: number;
  maxAtMs: number;
  visits: number;
  newVisits: number | null; // vs the previous day with data
  favorites: number | null;
  upVotes: number | null;
  downVotes: number | null;
  samples: number;
}

export interface Benchmark {
  value: number;
  topPct?: number; // share of the genre above this game, 0..100
  percentile?: number; // share of the genre below this game, 0..100
  p25?: number;
  p50: number;
  p75?: number;
  p90: number;
  p99?: number;
  n: number;
}

export interface GameHistory {
  universeId: number;
  rootPlaceId: number;
  name: string;
  creatorName: string;
  genre: string;
  genreL2: string | null;
  createdMs: number | null;
  firstSeenMs: number;
  canonicalUrlPath: string | null;
  ageRecommendation: string | null;
  asOfMs: number;
  daily: DailyPoint[];
  cur7: number | null;
  prev7: number | null;
  wowPct: number | null;
  peak7: number;
  peak7DayMs: number;
  stage: Stage | null; // null when too small or not seen this week
  rank: number | null; // by 7-day average among all games seen this week
  daysToMillion: number | null;
  highest: { players: number; atMs: number };
  latest: { visits: number; favorites: number | null; upVotes: number | null; downVotes: number | null };
  bench: {
    players: Benchmark | null;
    session: Benchmark | null;
    favourites: (Benchmark & { cohort: string }) | null;
  } | null;
  rhythm: { dow: number; game: number; all: number }[] | null;
  reach: { countries: string[]; devices: string[]; totalCountries: number; totalDevices: number; inAll: number; inOne: number } | null;
}

export interface AggRow {
  universe_id: number;
  genre: string;
  cur7: number | null;
  prev7: number | null;
  peak7: number;
  days_tracked: number;
  session: number | null;
  fav: number | null;
  vis: number | null;
}

const FAV_COHORTS: { min: number; label: string }[] = [
  { min: 1e9, label: "1B+ visits" },
  { min: 1e8, label: "100M to 1B visits" },
  { min: 1e7, label: "10M to 100M visits" },
  { min: 0, label: "under 10M visits" },
];

// Every game seen this week (plus one requested game), for rank and genre
// benchmarks. The same for every game page, so the site caches it hourly.
export function loadWeekAggregates(db: Db, day: string, universeId?: number): Promise<AggRow[]> {
  // Only the last two weeks of daily rows are read; peaks and history length
  // come from game_peaks. Session length is players divided by visits per
  // minute, using the real minutes between the last readings of consecutive
  // days (today is still a partial day).
  return db.query<AggRow>(
    `with base as (
       select universe_id, day, playing_avg, visits_last, favorites_last,
         visits_last - lag(visits_last) over w as nv,
         extract(epoch from last_ts - lag(last_ts) over w) / 60 as mins,
         day - lag(day) over w as gap
       from game_daily
       where day > $1::date - 15
       window w as (partition by universe_id order by day)
     ), agg as (
       select universe_id,
         avg(playing_avg) filter (where day > $1::date - 7) as cur7,
         avg(playing_avg) filter (where day <= $1::date - 7 and day > $1::date - 14) as prev7,
         avg(playing_avg) filter (where day > $1::date - 7 and gap = 1 and nv > 0 and mins > 0) as cm,
         sum(nv) filter (where day > $1::date - 7 and gap = 1 and nv > 0 and mins > 0)
           / nullif(sum(mins) filter (where day > $1::date - 7 and gap = 1 and nv > 0 and mins > 0), 0) as vpm,
         (array_agg(favorites_last order by day desc) filter (where favorites_last is not null))[1] as fav,
         (array_agg(visits_last order by day desc))[1] as vis
       from base group by universe_id
     )
     select p.universe_id::float8 as universe_id, coalesce(g.genre_l1, 'Other') as genre,
            a.cur7::float8 as cur7, a.prev7::float8 as prev7, p.peak7::float8 as peak7, p.days_tracked as days_tracked,
            (a.cm / nullif(a.vpm, 0))::float8 as session, a.fav::float8 as fav, a.vis::float8 as vis
     from game_peaks p
     join games g using (universe_id)
     left join agg a using (universe_id)
     where a.cur7 is not null or p.universe_id = $2::bigint`,
    [day, universeId ?? null],
  );
}

export async function getGameHistory(
  db: Db,
  universeId: number,
  opts: { loadAggregates?: (day: string) => Promise<AggRow[]> } = {},
): Promise<GameHistory | null> {
  const [game] = await db.query<{
    universe_id: number;
    root_place_id: number;
    name: string;
    creator_name: string | null;
    genre: string;
    genre_l2: string | null;
    created_ms: number | null;
    first_seen_ms: number;
    canonical_url_path: string | null;
    age_recommendation: string | null;
  }>(
    `select universe_id::float8 as universe_id, root_place_id::float8 as root_place_id, name, creator_name,
            coalesce(genre_l1, 'Other') as genre, genre_l2,
            extract(epoch from created_at)::float8 * 1000 as created_ms,
            extract(epoch from first_seen)::float8 * 1000 as first_seen_ms,
            canonical_url_path, age_recommendation
     from games where universe_id = $1`,
    [universeId],
  );
  if (!game) return null;

  const [latest] = await db.query<{ as_of_ms: number; day: string }>(
    `select extract(epoch from max(ts))::float8 * 1000 as as_of_ms, ((max(ts) at time zone 'UTC')::date)::text as day from snapshots`,
  );

  const rows = await db.query<{
    day_ms: number;
    avg: number;
    r7: number;
    max: number;
    max_at_ms: number;
    visits: number;
    prev_visits: number | null;
    fav: number | null;
    up: number | null;
    down: number | null;
    samples: number;
  }>(
    `select extract(epoch from day::timestamp)::float8 * 1000 as day_ms,
            playing_avg::float8 as avg,
            avg(playing_avg) over (order by day range between interval '6 days' preceding and current row)::float8 as r7,
            playing_max::float8 as max,
            extract(epoch from playing_max_at)::float8 * 1000 as max_at_ms,
            visits_last::float8 as visits,
            (lag(visits_last) over (order by day))::float8 as prev_visits,
            favorites_last::float8 as fav, up_votes_last::float8 as up, down_votes_last::float8 as down,
            samples::int as samples
     from game_daily where universe_id = $1 order by day`,
    [universeId],
  );
  if (rows.length === 0) return null;

  const daily: DailyPoint[] = rows.map((r) => ({
    dayMs: r.day_ms,
    avg: r.avg,
    r7: r.r7,
    max: r.max,
    maxAtMs: r.max_at_ms,
    visits: r.visits,
    newVisits: r.prev_visits === null ? null : Math.max(0, r.visits - r.prev_visits),
    favorites: r.fav,
    upVotes: r.up,
    downVotes: r.down,
    samples: r.samples,
  }));

  const all = await (opts.loadAggregates ?? ((day: string) => loadWeekAggregates(db, day)))(latest.day);
  const known = all.find((r) => r.universe_id === universeId);
  const me: AggRow = known ??
    (await loadWeekAggregates(db, latest.day, universeId)).find((r) => r.universe_id === universeId) ?? {
      // No game_peaks row yet: fall back to this game's own history.
      universe_id: universeId,
      genre: game.genre,
      cur7: null,
      prev7: null,
      peak7: Math.max(...daily.map((d) => d.r7)),
      days_tracked: daily.length,
      session: null,
      fav: null,
      vis: null,
    };
  const seenThisWeek = all.filter((r) => r.cur7 !== null);
  const cur7 = me.cur7;
  const peak7 = Math.max(me.peak7, cur7 ?? 0);
  const peakPoint = daily.reduce((a, b) => (b.r7 > a.r7 ? b : a), daily[0]);
  const highest = daily.reduce((a, b) => (b.max > a.max ? b : a), daily[0]);
  const millionDay = daily.find((d) => d.r7 >= 1_000_000);
  const dataStartMs = (await db.query<{ ms: number }>(`select extract(epoch from min(day)::timestamp)::float8 * 1000 as ms from game_daily`))[0].ms;
  const sawLaunch =
    game.created_ms !== null && game.created_ms >= dataStartMs && game.first_seen_ms - game.created_ms <= 14 * 86_400_000;

  const active = cur7 !== null && cur7 >= ACTIVE_MIN_PLAYERS;
  const stage = active
    ? lifecycleStage({ cur7, prev7: me.prev7, peak7, createdMs: game.created_ms, daysTracked: me.days_tracked, nowMs: latest.as_of_ms })
    : null;
  const rank = cur7 === null ? null : seenThisWeek.filter((r) => (r.cur7 ?? 0) > cur7).length + 1;

  let bench: GameHistory["bench"] = null;
  if (active) {
    const peers = all.filter((r) => r.genre === game.genre && r.cur7 !== null && r.cur7 >= ACTIVE_MIN_PLAYERS);
    const players = peers.map((r) => r.cur7!).sort((a, b) => a - b);
    const sessions = peers
      .map((r) => r.session)
      .filter((s): s is number => s !== null && s >= 0.5 && s <= 600)
      .sort((a, b) => a - b);
    const cohort = me.vis !== null ? FAV_COHORTS.find((c) => me.vis! >= c.min)! : null;
    const favPeers =
      cohort && me.fav !== null
        ? all
            .filter((r) => r.cur7 !== null && r.cur7 >= ACTIVE_MIN_PLAYERS && r.fav !== null && r.vis !== null && r.vis > 0)
            .filter((r) => FAV_COHORTS.find((c) => r.vis! >= c.min) === cohort)
            .map((r) => (1000 * r.fav!) / r.vis!)
            .sort((a, b) => a - b)
        : [];
    const mySession = me.session !== null && me.session >= 0.5 && me.session <= 600 ? me.session : null;
    bench = {
      players: players.length < 15 ? null : {
        value: cur7,
        topPct: 100 * (1 - shareBelow(players, cur7)),
        p50: quantile(players, 0.5),
        p90: quantile(players, 0.9),
        p99: players.length >= 100 ? quantile(players, 0.99) : undefined,
        n: players.length,
      },
      session:
        mySession !== null && sessions.length >= 15
          ? {
              value: mySession,
              percentile: 100 * shareBelow(sessions, mySession),
              p25: quantile(sessions, 0.25),
              p50: quantile(sessions, 0.5),
              p75: quantile(sessions, 0.75),
              p90: quantile(sessions, 0.9),
              n: sessions.length,
            }
          : null,
      favourites:
        cohort && me.fav !== null && me.vis && favPeers.length >= 15
          ? {
              value: (1000 * me.fav) / me.vis,
              percentile: 100 * shareBelow(favPeers, (1000 * me.fav) / me.vis),
              p25: quantile(favPeers, 0.25),
              p50: quantile(favPeers, 0.5),
              p90: quantile(favPeers, 0.9),
              n: favPeers.length,
              cohort: cohort.label,
            }
          : null,
    };
  }

  // Weekly rhythm over the last 20 complete weeks, if the game has at least
  // two readings for every weekday in that window.
  const rhythmRows = await db.query<{ dow: number; game: number | null; game_n: number; all: number }>(
    `with days as (
       select day, sum(playing_avg) as tot, max(playing_avg) filter (where universe_id = $2) as mine
       from game_daily where day < $1::date and day >= $1::date - 140 group by day
     )
     select extract(isodow from day)::int as dow, avg(mine)::float8 as game, count(mine)::int as game_n, avg(tot)::float8 as all
     from days group by 1 order by 1`,
    [latest.day, universeId],
  );
  let rhythm: GameHistory["rhythm"] = null;
  if (rhythmRows.length === 7 && rhythmRows.every((r) => r.game_n >= 2 && r.game !== null)) {
    const gm = rhythmRows.reduce((a, r) => a + r.game!, 0) / 7;
    const am = rhythmRows.reduce((a, r) => a + r.all, 0) / 7;
    rhythm = rhythmRows.map((r) => ({ dow: r.dow, game: (100 * r.game!) / gm, all: (100 * r.all) / am }));
  }

  const [reachRow] = await db.query<{
    countries: string[] | null;
    devices: string[] | null;
    total_countries: number;
    total_devices: number;
    in_all: number;
    in_one: number;
  }>(
    `with today as (select * from game_presence_daily where day = $1::date),
          totals as (
            select (select count(distinct c) from today, unnest(countries) c)::int as tc,
                   (select count(distinct d) from today, unnest(devices) d)::int as td
          )
     select (select countries from today where universe_id = $2) as countries,
            (select devices from today where universe_id = $2) as devices,
            totals.tc as total_countries, totals.td as total_devices,
            (select count(*) from today where cardinality(countries) = totals.tc)::int as in_all,
            (select count(*) from today where cardinality(countries) = 1)::int as in_one
     from totals`,
    [latest.day, universeId],
  );
  const reach =
    reachRow?.countries && reachRow.countries.length > 0
      ? {
          countries: reachRow.countries,
          devices: reachRow.devices ?? [],
          totalCountries: reachRow.total_countries,
          totalDevices: reachRow.total_devices,
          inAll: reachRow.in_all,
          inOne: reachRow.in_one,
        }
      : null;

  const last = daily[daily.length - 1];
  const lastWithVotes = [...daily].reverse().find((d) => d.upVotes !== null);
  return {
    universeId: game.universe_id,
    rootPlaceId: game.root_place_id,
    name: game.name,
    creatorName: game.creator_name ?? "Unknown",
    genre: game.genre,
    genreL2: game.genre_l2,
    createdMs: game.created_ms,
    firstSeenMs: game.first_seen_ms,
    canonicalUrlPath: game.canonical_url_path,
    ageRecommendation: game.age_recommendation,
    asOfMs: latest.as_of_ms,
    daily,
    cur7,
    prev7: me.prev7,
    wowPct: cur7 !== null && me.prev7 ? (100 * (cur7 - me.prev7)) / me.prev7 : null,
    peak7,
    peak7DayMs: peakPoint.dayMs,
    stage,
    rank,
    daysToMillion: sawLaunch && millionDay ? Math.round((millionDay.dayMs - game.created_ms!) / 86_400_000) : null,
    highest: { players: highest.max, atMs: highest.maxAtMs },
    latest: {
      visits: last.visits,
      favorites: [...daily].reverse().find((d) => d.favorites !== null)?.favorites ?? null,
      upVotes: lastWithVotes?.upVotes ?? null,
      downVotes: lastWithVotes?.downVotes ?? null,
    },
    bench,
    rhythm,
    reach,
  };
}
