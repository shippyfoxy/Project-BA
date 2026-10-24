import type { Db } from "@/lib/db/client";

export interface SearchHit {
  universeId: number;
  name: string;
  creatorName: string;
  genre: string;
  canonicalUrlPath: string | null;
  cur7: number | null;
  lastSeenMs: number;
}

export type SearchQuery =
  | { kind: "place"; placeId: string }
  | { kind: "id"; id: string }
  | { kind: "text"; text: string };

// A pasted Roblox link carries the root place ID (roblox.com/games/<placeId>/...);
// a bare number may be either a universe or a place ID.
export function parseSearch(raw: string): SearchQuery | null {
  const q = raw.trim();
  if (!q) return null;
  const link = q.match(/roblox\.com\/(?:[a-z]{2}\/)?games\/(\d+)/i);
  if (link) return { kind: "place", placeId: link[1] };
  if (/^\d{3,20}$/.test(q)) return { kind: "id", id: q };
  return { kind: "text", text: q.slice(0, 100) };
}

export async function searchGames(db: Db, query: SearchQuery, limit = 50): Promise<SearchHit[]> {
  let where: string;
  let param: string;
  if (query.kind === "place") {
    where = "g.root_place_id = $1::bigint";
    param = query.placeId;
  } else if (query.kind === "id") {
    where = "(g.universe_id = $1::bigint or g.root_place_id = $1::bigint)";
    param = query.id;
  } else {
    where = "(g.name ilike $1 escape '\\' or g.creator_name ilike $1 escape '\\')";
    param = `%${query.text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  const rows = await db.query<{
    universe_id: number;
    name: string;
    creator_name: string | null;
    genre: string;
    canonical_url_path: string | null;
    cur7: number | null;
    last_seen_ms: number;
  }>(
    `with latest as (select (max(ts) at time zone 'UTC')::date as day from snapshots)
     select g.universe_id::float8 as universe_id, g.name, g.creator_name, coalesce(g.genre_l1, 'Other') as genre,
            g.canonical_url_path,
            (select avg(d.playing_avg) from game_daily d, latest
              where d.universe_id = g.universe_id and d.day > latest.day - 7)::float8 as cur7,
            extract(epoch from g.last_seen)::float8 * 1000 as last_seen_ms
     from games g
     where ${where}
     order by cur7 desc nulls last, g.last_seen desc
     limit $2`,
    [param, limit],
  );
  return rows.map((r) => ({
    universeId: r.universe_id,
    name: r.name,
    creatorName: r.creator_name ?? "Unknown",
    genre: r.genre,
    canonicalUrlPath: r.canonical_url_path,
    cur7: r.cur7,
    lastSeenMs: r.last_seen_ms,
  }));
}
