import type { Db } from "./client";

// Raw 30-minute readings older than this are pruned once rolled up into
// game_daily. 14 days of ~1,200 games is roughly 100 MB on Neon.
export const RAW_RETENTION_DAYS = 14;

const DAY_MS = 86_400_000;
const BATCH = 5_000;

// Loose on purpose: snapshots in git history predate several fields.
export interface IngestGame {
  universeId: number;
  rootPlaceId: number;
  name: string;
  creatorName?: string | null;
  genreL1?: string | null;
  genreL2?: string | null;
  created?: string | null;
  canonicalUrlPath?: string | null;
  minimumAge?: number | null;
  ageRecommendation?: string | null;
  popularInCountries?: string[];
  popularOnDevices?: string[];
  playing: number;
  visits: number;
  favoritedCount?: number | null;
  upVotes?: number | null;
  downVotes?: number | null;
  samples?: { ts: number; playing: number; visits: number }[];
}

export interface IngestSnapshot {
  generatedAt: string;
  generatedAtMs?: number;
  source?: string;
  games: IngestGame[];
}

export interface IngestOptions {
  gitSha?: string | null;
  // Also store readings from each game's rolling samples array. Only useful
  // for history, where some refresh runs were never committed.
  includeSamples?: boolean;
  // Readings older than this are dropped: their day is already rolled up and
  // its raw rows pruned, so re-inserting them would corrupt the next rollup.
  minTs?: number;
}

export interface IngestResult {
  skipped: boolean;
  ts: number;
  games: number;
  observations: number;
  droppedInvalid: number;
  // Oldest reading written, so callers can re-roll days it touched.
  earliestTs: number | null;
}

export function snapshotTs(s: IngestSnapshot): number {
  const ms = Number.isFinite(s.generatedAtMs) ? Number(s.generatedAtMs) : Date.parse(s.generatedAt);
  if (!Number.isFinite(ms)) throw new Error(`snapshot has no usable timestamp: ${s.generatedAt}`);
  return ms;
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

const count = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;

const isId = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += BATCH) out.push(rows.slice(i, i + BATCH));
  return out;
}

// Columns refreshed only when the incoming snapshot is at least as new as the
// stored row; nullable ones keep the old value rather than being blanked by
// older snapshot formats that lack them.
const GAME_COLS = [
  ["root_place_id", false],
  ["name", false],
  ["creator_name", true],
  ["genre_l1", true],
  ["genre_l2", true],
  ["created_at", true],
  ["canonical_url_path", true],
  ["minimum_age", true],
  ["age_recommendation", true],
] as const;

const GAME_UPSERT = `
  insert into games (universe_id, ${GAME_COLS.map(([c]) => c).join(", ")}, first_seen, last_seen)
  select universe_id, ${GAME_COLS.map(([c]) => c).join(", ")}, $2::timestamptz, $2::timestamptz
  from jsonb_to_recordset($1::text::jsonb) as x(
    universe_id bigint, root_place_id bigint, name text, creator_name text,
    genre_l1 text, genre_l2 text, created_at timestamptz, canonical_url_path text,
    minimum_age smallint, age_recommendation text
  )
  on conflict (universe_id) do update set
    ${GAME_COLS.map(([c, nullable]) => {
      const incoming = nullable ? `coalesce(excluded.${c}, games.${c})` : `excluded.${c}`;
      return `${c} = case when excluded.last_seen >= games.last_seen then ${incoming} else games.${c} end`;
    }).join(",\n    ")},
    first_seen = least(games.first_seen, excluded.first_seen),
    last_seen = greatest(games.last_seen, excluded.last_seen)
`;

const OBS_UPSERT = `
  insert into observations (universe_id, ts, playing, visits, favorites, up_votes, down_votes)
  select universe_id, ts, playing, visits, favorites, up_votes, down_votes
  from jsonb_to_recordset($1::text::jsonb) as x(
    universe_id bigint, ts timestamptz, playing integer, visits bigint,
    favorites integer, up_votes integer, down_votes integer
  )
  on conflict (universe_id, ts) do update set
    favorites = coalesce(excluded.favorites, observations.favorites),
    up_votes = coalesce(excluded.up_votes, observations.up_votes),
    down_votes = coalesce(excluded.down_votes, observations.down_votes)
`;

const PRESENCE_UPSERT = `
  insert into game_presence_daily (universe_id, day, countries, devices)
  select universe_id, $2::date, countries, devices
  from jsonb_to_recordset($1::text::jsonb) as x(universe_id bigint, countries text[], devices text[])
  on conflict (universe_id, day) do update set
    countries = array(select distinct unnest(game_presence_daily.countries || excluded.countries) order by 1),
    devices = array(select distinct unnest(game_presence_daily.devices || excluded.devices) order by 1)
  -- Most refreshes add nothing new; skipping those avoids writing a dead
  -- row version per game per refresh.
  where not (game_presence_daily.countries @> excluded.countries
             and game_presence_daily.devices @> excluded.devices)
`;

export async function ingestSnapshot(
  db: Db,
  snap: IngestSnapshot,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const ts = snapshotTs(snap);
  const minTs = opts.minTs ?? -Infinity;
  const tsIso = new Date(ts).toISOString();

  const existing = await db.query("select 1 from snapshots where ts = $1", [tsIso]);
  if (existing.length > 0) {
    return { skipped: true, ts, games: 0, observations: 0, droppedInvalid: 0, earliestTs: null };
  }

  const games = new Map<number, IngestGame>();
  let droppedInvalid = 0;
  for (const g of snap.games ?? []) {
    if (!isId(g.universeId) || !isId(g.rootPlaceId) || !g.name) {
      droppedInvalid++;
      continue;
    }
    games.set(g.universeId, g);
  }

  // Keyed by universe+ts; the top-level reading wins over a samples entry
  // with the same timestamp because it also carries votes and favourites.
  const obs = new Map<string, Record<string, unknown>>();
  const presence: Record<string, unknown>[] = [];
  for (const g of games.values()) {
    if (opts.includeSamples) {
      for (const s of g.samples ?? []) {
        const playing = count(s.playing);
        const visits = count(s.visits);
        if (!Number.isFinite(s.ts) || s.ts < minTs || playing === null || visits === null) continue;
        obs.set(`${g.universeId}:${s.ts}`, {
          universe_id: g.universeId,
          ts: new Date(s.ts).toISOString(),
          playing,
          visits,
          favorites: null,
          up_votes: null,
          down_votes: null,
        });
      }
    }
    const playing = count(g.playing);
    const visits = count(g.visits);
    if (playing === null || visits === null) {
      droppedInvalid++;
    } else if (ts >= minTs) {
      obs.set(`${g.universeId}:${ts}`, {
        universe_id: g.universeId,
        ts: tsIso,
        playing,
        visits,
        favorites: count(g.favoritedCount),
        up_votes: count(g.upVotes),
        down_votes: count(g.downVotes),
      });
    }
    const countries = g.popularInCountries ?? [];
    const devices = g.popularOnDevices ?? [];
    if (countries.length > 0 || devices.length > 0) {
      presence.push({ universe_id: g.universeId, countries, devices });
    }
  }

  const gameRows = [...games.values()].map((g) => ({
    universe_id: g.universeId,
    root_place_id: g.rootPlaceId,
    name: g.name,
    creator_name: g.creatorName ?? null,
    genre_l1: g.genreL1 || null,
    genre_l2: g.genreL2 || null,
    created_at: g.created && Number.isFinite(Date.parse(g.created)) ? g.created : null,
    canonical_url_path: g.canonicalUrlPath ?? null,
    minimum_age: count(g.minimumAge),
    age_recommendation: g.ageRecommendation ?? null,
  }));
  const obsRows = [...obs.values()];
  let earliestTs: number | null = null;
  for (const r of obsRows) {
    const t = Date.parse(r.ts as string);
    if (earliestTs === null || t < earliestTs) earliestTs = t;
  }

  await db.transaction(async (tx) => {
    for (const rows of chunks(gameRows)) {
      await tx.query(GAME_UPSERT, [JSON.stringify(rows), tsIso]);
    }
    for (const rows of chunks(obsRows)) {
      await tx.query(OBS_UPSERT, [JSON.stringify(rows)]);
    }
    for (const rows of chunks(presence)) {
      await tx.query(PRESENCE_UPSERT, [JSON.stringify(rows), utcDay(ts)]);
    }
    // Written last so a crash mid-ingest leaves no marker and the snapshot is retried.
    await tx.query(
      "insert into snapshots (ts, game_count, source, git_sha) values ($1, $2, $3, $4)",
      [tsIso, games.size, snap.source ?? "explore-api+games-api", opts.gitSha ?? null],
    );
  });

  return {
    skipped: false,
    ts,
    games: games.size,
    observations: obsRows.length,
    droppedInvalid,
    earliestTs,
  };
}

// Recomputes game_daily for UTC days in [fromDay, toDay) from raw rows.
// Only call it for days whose raw rows have not been pruned.
export async function rollupDays(db: Db, fromDay: string, toDay: string): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `with up as (
       insert into game_daily (
         universe_id, day, samples, playing_avg, playing_min, playing_max, playing_max_at,
         first_ts, last_ts, visits_first, visits_last,
         favorites_last, up_votes_last, down_votes_last
       )
       select
         universe_id,
         (ts at time zone 'UTC')::date,
         count(*),
         avg(playing)::real,
         min(playing),
         max(playing),
         (array_agg(ts order by playing desc, ts))[1],
         min(ts),
         max(ts),
         (array_agg(visits order by ts))[1],
         (array_agg(visits order by ts desc))[1],
         (array_agg(favorites order by ts desc) filter (where favorites is not null))[1],
         (array_agg(up_votes order by ts desc) filter (where up_votes is not null))[1],
         (array_agg(down_votes order by ts desc) filter (where down_votes is not null))[1]
       from observations
       where ts >= ($1::date)::timestamp at time zone 'UTC'
         and ts < ($2::date)::timestamp at time zone 'UTC'
       group by 1, 2
       on conflict (universe_id, day) do update set
         samples = excluded.samples,
         playing_avg = excluded.playing_avg,
         playing_min = excluded.playing_min,
         playing_max = excluded.playing_max,
         playing_max_at = excluded.playing_max_at,
         first_ts = excluded.first_ts,
         last_ts = excluded.last_ts,
         visits_first = excluded.visits_first,
         visits_last = excluded.visits_last,
         favorites_last = excluded.favorites_last,
         up_votes_last = excluded.up_votes_last,
         down_votes_last = excluded.down_votes_last
       returning 1
     )
     select count(*)::int as n from up`,
    [fromDay, toDay],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function pruneObservations(db: Db, beforeMs: number): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `with del as (delete from observations where ts < $1 returning 1)
     select count(*)::int as n from del`,
    [new Date(beforeMs).toISOString()],
  );
  return Number(rows[0]?.n ?? 0);
}

export function retentionCutoff(nowMs: number): number {
  return startOfUtcDay(nowMs) - RAW_RETENTION_DAYS * DAY_MS;
}

export { DAY_MS };
