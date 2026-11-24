import type { Db } from "@/lib/db/client";
import type { FeedItem } from "@/lib/feeds";
import { fmtDay, fmtInt, fmtPct } from "@/lib/format";
import { getCreatorGames, type CreatorKind } from "@/lib/roblox/creators";
import { SITE } from "@/lib/widgets";
import type { HitLife } from "./lifespan";
import { displayName } from "./names";
import { isAnnounced } from "./updates";
import type { SubgenreShare } from "./genreTrends";

// A watchlist lives in the address, so it can be bookmarked and the same
// address under /feeds/watch.xml is its RSS feed: g=games, s=studios
// ("group:123,user:4"), sub=subgenres ("Simulation|Tycoon").
export interface WatchList {
  games: number[];
  studios: { kind: CreatorKind; id: number }[];
  subgenres: { genre: string; subgenre: string }[];
}

// Each studio costs a few Roblox calls per uncached address, so studios are kept few.
export const WATCH_LIMITS = { games: 50, studios: 10, subgenres: 20 };
const DAY_MS = 86_400_000;
const EVENT_DAYS = 30;
const MOVE = 0.3; // a week-on-week change worth an alert
const MIN_MOVE_PLAYERS = 100;
const SUB_MOVE_PTS = 0.5; // a subgenre's share of all players moving this many points

const id = (s: string) => (/^\d{1,20}$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0 ? Number(s) : null);

export function parseWatch(p: { g?: string | null; s?: string | null; sub?: string | null }): WatchList {
  const list = (v?: string | null) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const games = [...new Set(list(p.g).map(id).filter((x): x is number => x !== null))].slice(0, WATCH_LIMITS.games);
  const studios = list(p.s)
    .map((x) => x.split(":"))
    .filter(([k, v]) => (k === "group" || k === "user") && id(v ?? "") !== null)
    .map(([k, v]) => ({ kind: k as CreatorKind, id: Number(v) }))
    .filter((x, i, a) => a.findIndex((y) => y.kind === x.kind && y.id === x.id) === i)
    .slice(0, WATCH_LIMITS.studios);
  const subgenres = list(p.sub)
    .map((x) => x.split("|"))
    .filter((x) => x.length === 2 && x.every((y) => y.length > 0 && y.length <= 60))
    .map(([genre, subgenre]) => ({ genre, subgenre }))
    .slice(0, WATCH_LIMITS.subgenres);
  return { games, studios, subgenres };
}

export function watchQuery(w: WatchList): string {
  const q = new URLSearchParams();
  if (w.games.length) q.set("g", w.games.join(","));
  if (w.studios.length) q.set("s", w.studios.map((s) => `${s.kind}:${s.id}`).join(","));
  if (w.subgenres.length) q.set("sub", w.subgenres.map((s) => `${s.genre}|${s.subgenre}`).join(","));
  return q.toString();
}

export interface WatchGame {
  universeId: number;
  name: string;
  genre: string;
  subgenre: string | null;
  cur7: number | null; // last 7 complete days
  prev7: number | null; // the 7 before
  peak7: number | null;
  peakDayMs: number | null;
}

export interface WatchStudio {
  kind: CreatorKind;
  id: number;
  name: string | null;
  games: number;
  playing: number;
  newest: { universeId: number; name: string; createdMs: number } | null;
}

export interface Watch {
  games: WatchGame[];
  studios: WatchStudio[];
  subgenres: SubgenreShare[];
  events: FeedItem[];
}

export async function getWatch(db: Db, w: WatchList, ctx: { hitLives: HitLife[]; subgenres: SubgenreShare[] }): Promise<Watch> {
  const [games, names] = w.games.length
    ? await Promise.all([
        db.query<{ universe_id: number; name: string; genre: string; subgenre: string | null; cur7: number | null; prev7: number | null; peak7: number | null; peak_ms: number | null; last_ms: number }>(
          `with last as (select max(day) as day from game_daily)
           select g.universe_id::float8 as universe_id, g.name, coalesce(nullif(g.genre_l1, 'All'), 'Other') as genre, nullif(g.genre_l2, '') as subgenre,
                  avg(d.playing_avg) filter (where d.day >= last.day - 7 and d.day < last.day)::float8 as cur7,
                  avg(d.playing_avg) filter (where d.day >= last.day - 14 and d.day < last.day - 7)::float8 as prev7,
                  p.peak7::float8 as peak7, extract(epoch from p.peak7_day)::float8 * 1000 as peak_ms,
                  extract(epoch from last.day - 1)::float8 * 1000 as last_ms
           from games g cross join last
           left join game_peaks p using (universe_id)
           left join game_daily d on d.universe_id = g.universe_id and d.day >= last.day - 14
           where g.universe_id = any($1::bigint[])
           group by g.universe_id, g.name, g.genre_l1, g.genre_l2, p.peak7, p.peak7_day, last.day`,
          [w.games],
        ),
        db.query<{ universe_id: number; name: string; prev_name: string | null; first_ms: number }>(
          `select universe_id::float8 as universe_id, name, prev_name, first_ms from (
             select universe_id, name, lag(name) over (partition by universe_id order by first_seen) as prev_name,
                    first_seen, extract(epoch from first_seen)::float8 * 1000 as first_ms
             from game_names where universe_id = any($1::bigint[])) t
           where first_seen > now() - interval '${EVENT_DAYS} days' and prev_name is not null`,
          [w.games],
        ),
      ])
    : [[], []];
  const studios = await Promise.all(w.studios.map(async (s) => ({ s, r: await getCreatorGames(s.kind, s.id) })));

  const since = Date.now() - EVENT_DAYS * DAY_MS;
  const events: FeedItem[] = [];
  const link = (uid: number) => `${SITE}/games/${uid}`;
  for (const g of games) {
    const name = displayName(g.name);
    if (g.cur7 !== null && g.prev7 && g.cur7 >= MIN_MOVE_PLAYERS && Math.abs(g.cur7 / g.prev7 - 1) >= MOVE) {
      const ch = g.cur7 / g.prev7 - 1;
      events.push({
        guid: `move-${g.universe_id}-${new Date(g.last_ms).toISOString().slice(0, 10)}`,
        title: `${name} ${ch > 0 ? "up" : "down"} ${fmtPct(Math.abs(ch) * 100).replace(/^[+−-]/, "")} this week`,
        link: link(g.universe_id),
        description: `${fmtInt(g.cur7)} players on average over the last 7 days, against ${fmtInt(g.prev7)} the week before.`,
        dateMs: g.last_ms,
      });
    }
    if (g.peak_ms !== null && g.peak7 !== null && g.peak_ms > since)
      events.push({
        guid: `best-${g.universe_id}-${new Date(g.peak_ms).toISOString().slice(0, 10)}`,
        title: `${name}: best week yet`,
        link: link(g.universe_id),
        description: `${fmtInt(g.peak7)} players on average in the week to ${fmtDay(g.peak_ms)}, its highest since tracking began.`,
        dateMs: g.peak_ms + DAY_MS,
      });
    const life = ctx.hitLives.find((h) => h.universeId === g.universe_id);
    if (life?.half != null && life.peakDayMs + life.half * DAY_MS > since)
      events.push({
        guid: `half-${g.universe_id}`,
        title: `${name} fell below half its best week`,
        link: link(g.universe_id),
        description: `${life.half} days after its best week (${fmtInt(life.peak7)} players, week to ${fmtDay(life.peakDayMs)}).`,
        dateMs: life.peakDayMs + (life.half + 1) * DAY_MS,
      });
  }
  for (const n of names) {
    const announced = isAnnounced(n.prev_name!, n.name);
    // A countdown ticking down ("[6D⏳]" to "[5D⏳]") is neither an update nor a new name.
    if (!announced && displayName(n.prev_name!) === displayName(n.name)) continue;
    events.push({
      guid: `name-${n.universe_id}-${n.first_ms}`,
      title: `${displayName(n.name)}: ${announced ? "announced an update" : "renamed"}`,
      link: link(n.universe_id),
      description: `Title changed from "${n.prev_name}" to "${n.name}".`,
      dateMs: n.first_ms,
    });
  }
  const subs = w.subgenres
    .map((x) => ctx.subgenres.find((s) => s.genre === x.genre && s.subgenre === x.subgenre))
    .filter((x): x is SubgenreShare => !!x);
  for (const s of subs) {
    const d = s.firstShare === null ? 0 : (s.share - s.firstShare) * 100;
    const last = s.weeks[s.weeks.length - 1];
    if (Math.abs(d) >= SUB_MOVE_PTS && last)
      events.push({
        guid: `sub-${s.genre}-${s.subgenre}-${new Date(last.endMs).toISOString().slice(0, 10)}`,
        title: `${s.subgenre} (${s.genre}) ${d > 0 ? "up" : "down"} ${Math.abs(d).toFixed(1)} points since late October`,
        link: `${SITE}/genres#subgenres`,
        description: `${(s.share * 100).toFixed(1)}% of all players in the week to ${fmtDay(last.endMs)}, against ${((s.firstShare ?? 0) * 100).toFixed(1)}% in the week to ${fmtDay(s.weeks[0].endMs)}.`,
        dateMs: last.endMs,
      });
  }
  const studioRows: WatchStudio[] = studios.map(({ s, r }) => {
    const list = r?.games ?? [];
    const newest = [...list].sort((a, b) => b.createdMs - a.createdMs)[0] ?? null;
    for (const g of list.filter((x) => x.createdMs > since))
      events.push({
        guid: `new-${g.universeId}`,
        title: `${r?.name ?? "A studio you follow"} made a new game: ${displayName(g.name)}`,
        link: `${SITE}/studios/${s.kind}/${s.id}`,
        description: `Created ${fmtDay(g.createdMs)}${g.playing !== null ? `, ${fmtInt(g.playing)} playing now` : ""}.`,
        dateMs: g.createdMs,
      });
    return {
      kind: s.kind,
      id: s.id,
      name: r?.name ?? null,
      games: list.length,
      playing: list.reduce((a, g) => a + (g.playing ?? 0), 0),
      newest: newest ? { universeId: newest.universeId, name: newest.name, createdMs: newest.createdMs } : null,
    };
  });

  return {
    games: games
      .map((g) => ({ universeId: g.universe_id, name: g.name, genre: g.genre, subgenre: g.subgenre, cur7: g.cur7, prev7: g.prev7, peak7: g.peak7, peakDayMs: g.peak_ms }))
      .sort((a, b) => (b.cur7 ?? 0) - (a.cur7 ?? 0)),
    studios: studioRows,
    subgenres: subs,
    events: events.sort((a, b) => b.dateMs - a.dateMs),
  };
}
