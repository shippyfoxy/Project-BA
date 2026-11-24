import type { Db } from "@/lib/db/client";
import { distinctWords } from "./ideas";

// Games named like this one, from any studio: sequels, spin-offs and clones.
// Words are weighted by how rare they are across every known game, so
// "Sailor Piece 2" matches "Sailor Piece" but "Grand Piece Online" does not.
export interface RelatedGame {
  universeId: number;
  name: string;
  creatorName: string | null;
  studioHref: string | null;
  sameCreator: boolean;
  createdMs: number | null;
  peak7: number | null; // best 7-day average
  peak7DayMs: number | null;
  cur7: number | null;
  score: number; // 0..1, share of the name's weight the two names share
}

export interface Related {
  words: string[];
  games: RelatedGame[];
  total: number; // every match, before the list is cut to the biggest
  afterPeak: number; // matches created after this game's peak week
}

const MIN_SCORE = 0.6;
const LIMIT = 15;
const stem = (w: string) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);

export function nameScore(target: string[], other: string[], idf: (w: string) => number): number {
  const mine = new Set(other.map(stem));
  const total = target.reduce((a, w) => a + idf(w), 0);
  const shared = target.filter((w) => mine.has(stem(w))).reduce((a, w) => a + idf(w), 0);
  return total > 0 ? shared / total : 0;
}

export async function getRelatedGames(db: Db, universeId: number): Promise<Related | null> {
  const [me] = await db.query<{ name: string; creator_type: string | null; creator_id: number | null; peak_ms: number | null }>(
    `select g.name, g.creator_type, g.creator_id::float8 as creator_id, extract(epoch from p.peak7_day)::float8 * 1000 as peak_ms
     from games g left join game_peaks p using (universe_id) where g.universe_id = $1`,
    [universeId],
  );
  if (!me) return null;
  const words = distinctWords(me.name);
  if (!words.length) return { words, games: [], total: 0, afterPeak: 0 };

  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from games`);
  const cands = await db.query<{
    universe_id: number;
    name: string;
    creator_name: string | null;
    creator_type: string | null;
    creator_id: number | null;
    created_ms: number | null;
    peak7: number | null;
    peak_ms: number | null;
  }>(
    `select g.universe_id::float8 as universe_id, g.name, g.creator_name, g.creator_type, g.creator_id::float8 as creator_id,
            extract(epoch from g.created_at)::float8 * 1000 as created_ms, p.peak7::float8 as peak7,
            extract(epoch from p.peak7_day)::float8 * 1000 as peak_ms
     from games g left join game_peaks p using (universe_id)
     where g.universe_id <> $1 and lower(g.name) like any($2::text[])`,
    [universeId, words.map((w) => `%${stem(w).replace(/[\\%_]/g, (c) => `\\${c}`)}%`)],
  );

  // Document frequency from the candidates themselves: each one contains at least one of the words.
  const candWords = cands.map((c) => distinctWords(c.name).map(stem));
  const df = new Map(words.map((w) => [w, candWords.filter((cw) => cw.includes(stem(w))).length]));
  const idf = (w: string) => Math.log(n / (1 + (df.get(w) ?? 0)));

  const matched = cands.map((c, i) => ({ c, score: nameScore(words, candWords[i], idf) })).filter((x) => x.score >= MIN_SCORE);
  const scored = [...matched]
    .sort((a, b) => (b.c.peak7 ?? 0) - (a.c.peak7 ?? 0) || b.score - a.score)
    .slice(0, LIMIT);
  const ids = scored.map((x) => x.c.universe_id);
  const cur = ids.length
    ? await db.query<{ universe_id: number; cur7: number }>(
        `select universe_id::float8 as universe_id, avg(playing_avg)::float8 as cur7 from game_daily
         where universe_id = any($1::bigint[]) and day > (select max(day) from game_daily) - 8 and day < (select max(day) from game_daily)
         group by 1`,
        [ids],
      )
    : [];

  const games: RelatedGame[] = scored.map(({ c, score }) => ({
    universeId: c.universe_id,
    name: c.name,
    creatorName: c.creator_name,
    studioHref: c.creator_id && c.creator_type ? `/studios/${c.creator_type === "Group" ? "group" : "user"}/${c.creator_id}` : null,
    sameCreator: !!me.creator_id && c.creator_id === me.creator_id && c.creator_type === me.creator_type,
    createdMs: c.created_ms,
    peak7: c.peak7,
    peak7DayMs: c.peak_ms,
    cur7: cur.find((x) => x.universe_id === c.universe_id)?.cur7 ?? null,
    score,
  }));
  const afterPeak = me.peak_ms === null ? 0 : matched.filter((x) => x.c.created_ms !== null && x.c.created_ms > me.peak_ms!).length;
  return { words, games, total: matched.length, afterPeak };
}
