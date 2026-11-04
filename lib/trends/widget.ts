import type { Db } from "@/lib/db/client";
import { ACTIVE_MIN_PLAYERS } from "./home";
import { lifecycleStage, type Stage } from "./stage";

// What the embeddable card and badge show for one game: light enough to run
// on every embed view, unlike the full game page.
export interface WidgetGame {
  universeId: number;
  name: string;
  genre: string;
  cur7: number | null; // 7-day average players to the last complete day
  prev7: number | null;
  wowPct: number | null;
  now: number | null; // the latest reading
  nowMs: number | null;
  stage: Stage | null; // only for games averaging 1,000+
  days: [number, number][]; // [dayMs, average players], last 30 complete days
}

export async function getWidgetGame(db: Db, universeId: number): Promise<WidgetGame | null> {
  const [g] = await db.query<{
    name: string;
    genre: string;
    created_ms: number | null;
    peak7: number | null;
    days_tracked: number | null;
    cur7: number | null;
    prev7: number | null;
    now: number | null;
    now_ms: number | null;
    as_of_ms: number;
    day: string;
  }>(
    `with latest as (select (max(ts) at time zone 'UTC')::date - 1 as day, max(ts) as ts from snapshots)
     select g.name, coalesce(g.genre_l1, 'Other') as genre,
            extract(epoch from g.created_at)::float8 * 1000 as created_ms,
            p.peak7::float8 as peak7, p.days_tracked,
            (select avg(playing_avg) from game_daily d
              where d.universe_id = g.universe_id and d.day > latest.day - 7 and d.day <= latest.day)::float8 as cur7,
            (select avg(playing_avg) from game_daily d
              where d.universe_id = g.universe_id and d.day > latest.day - 14 and d.day <= latest.day - 7)::float8 as prev7,
            o.playing as now, extract(epoch from o.ts)::float8 * 1000 as now_ms,
            extract(epoch from latest.ts)::float8 * 1000 as as_of_ms, latest.day::text as day
     from games g
     cross join latest
     left join game_peaks p using (universe_id)
     left join lateral (select playing, ts from observations where universe_id = g.universe_id order by ts desc limit 1) o on true
     where g.universe_id = $1::bigint`,
    [universeId],
  );
  if (!g) return null;
  const days = await db.query<{ day_ms: number; players: number }>(
    `select extract(epoch from day)::float8 * 1000 as day_ms, playing_avg::float8 as players
     from game_daily where universe_id = $1::bigint and day > $2::date - 30 and day <= $2::date order by day`,
    [universeId, g.day],
  );
  const cur7 = g.cur7;
  return {
    universeId,
    name: g.name,
    genre: g.genre,
    cur7,
    prev7: g.prev7,
    wowPct: cur7 !== null && g.prev7 ? (100 * (cur7 - g.prev7)) / g.prev7 : null,
    now: g.now,
    nowMs: g.now_ms,
    stage:
      cur7 !== null && cur7 >= ACTIVE_MIN_PLAYERS
        ? lifecycleStage({
            cur7,
            prev7: g.prev7,
            peak7: Math.max(g.peak7 ?? cur7, cur7),
            createdMs: g.created_ms,
            daysTracked: g.days_tracked ?? 1,
            nowMs: g.as_of_ms,
          })
        : null,
    days: days.map((d) => [d.day_ms, d.players]),
  };
}

// Text for XML and HTML built by hand: game names are chosen by anyone.
export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// The id in /badge/123.svg or /embed/games/123.
export function parseWidgetId(raw: string): number | null {
  const m = raw.match(/^(\d{1,20})(?:\.svg)?$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
