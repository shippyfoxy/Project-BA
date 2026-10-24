import type { Db } from "./client";
import type { Snapshot, SnapshotGame } from "../snapshot/schema";

// Matches what refresh-data kept per game in the JSON snapshot.
const SAMPLES_PER_GAME = 48;

interface GameRow {
  universe_id: number;
  root_place_id: number;
  name: string;
  creator_name: string | null;
  genre_l1: string | null;
  genre_l2: string | null;
  created_ms: number | null;
  canonical_url_path: string | null;
  minimum_age: number | null;
  age_recommendation: string | null;
  playing: number;
  visits: number;
  favorites: number | null;
  up_votes: number | null;
  down_votes: number | null;
}

interface SampleRow {
  universe_id: number;
  ts_ms: number;
  playing: number;
  visits: number;
}

interface PresenceRow {
  universe_id: number;
  countries: string[];
  devices: string[];
}

// Rebuilds the dashboard's Snapshot from the latest refresh in the database.
// Numbers are cast to float8 in SQL because postgres.js returns bigint as a
// string; every value here fits a double exactly.
export async function loadSnapshotFromDb(db: Db): Promise<Snapshot | null> {
  const [latest] = await db.query<{ ts_ms: number; source: string }>(
    `select extract(epoch from ts)::float8 * 1000 as ts_ms, source from snapshots order by ts desc limit 1`,
  );
  if (!latest) return null;
  const tsIso = new Date(latest.ts_ms).toISOString();

  const games = await db.query<GameRow>(
    `select g.universe_id::float8 as universe_id, g.root_place_id::float8 as root_place_id, g.name,
            g.creator_name, g.genre_l1, g.genre_l2,
            extract(epoch from g.created_at)::float8 * 1000 as created_ms,
            g.canonical_url_path, g.minimum_age, g.age_recommendation,
            o.playing, o.visits::float8 as visits, o.favorites, o.up_votes, o.down_votes
     from observations o join games g using (universe_id)
     where o.ts = $1`,
    [tsIso],
  );
  if (games.length === 0) return null;

  const samples = await db.query<SampleRow>(
    `select universe_id::float8 as universe_id, extract(epoch from ts)::float8 * 1000 as ts_ms, playing, visits::float8 as visits
     from (
       select o.*, row_number() over (partition by o.universe_id order by o.ts desc) as rn
       from observations o
       where o.universe_id in (select universe_id from observations where ts = $1) and o.ts <= $1
     ) recent
     where rn <= $2
     order by universe_id, ts`,
    [tsIso, SAMPLES_PER_GAME],
  );
  const samplesById = new Map<number, SnapshotGame["samples"]>();
  for (const s of samples) {
    const list = samplesById.get(s.universe_id) ?? [];
    list.push({ ts: s.ts_ms, playing: s.playing, visits: s.visits });
    samplesById.set(s.universe_id, list);
  }

  const presence = await db.query<PresenceRow>(
    `select universe_id::float8 as universe_id, countries, devices from game_presence_daily
     where day = ($1::timestamptz at time zone 'UTC')::date`,
    [tsIso],
  );
  const presenceById = new Map(presence.map((p) => [p.universe_id, p]));

  return {
    generatedAt: tsIso,
    generatedAtMs: latest.ts_ms,
    source: "explore-api+games-api",
    games: games.map((g) => {
      const p = presenceById.get(g.universe_id);
      return {
        universeId: g.universe_id,
        rootPlaceId: g.root_place_id,
        name: g.name,
        creatorName: g.creator_name ?? "Unknown",
        genreL1: g.genre_l1 ?? "Other",
        genreL2: g.genre_l2 ?? "",
        visits: g.visits,
        favoritedCount: g.favorites ?? 0,
        upVotes: g.up_votes ?? 0,
        downVotes: g.down_votes ?? 0,
        playing: g.playing,
        created: g.created_ms === null ? "" : new Date(g.created_ms).toISOString(),
        // Not stored in the database; nothing on the site reads it.
        updated: "",
        canonicalUrlPath: g.canonical_url_path ?? "",
        minimumAge: g.minimum_age,
        ageRecommendation: g.age_recommendation,
        popularInCountries: p?.countries ?? [],
        popularOnDevices: p?.devices ?? [],
        samples: samplesById.get(g.universe_id) ?? [],
      };
    }),
  };
}
