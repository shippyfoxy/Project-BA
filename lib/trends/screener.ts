import type { Db } from "@/lib/db/client";
import { lifecycleStage, STAGES, type Stage } from "./stage";
import { parseSearch, searchWhere } from "./search";

const DAY_MS = 86_400_000;

export const LAUNCHED = ["30", "60", "90", "365", "any"] as const;
export type Launched = (typeof LAUNCHED)[number];
export const MIN_PLAYERS = [0, 100, 1_000, 10_000, 100_000] as const;
export const SORTS = ["players", "wow", "session", "favs", "newest"] as const;
export type SortKey = (typeof SORTS)[number];
export const COUNTRIES = ["us", "br", "id", "in", "ph", "gb", "de", "ru", "kr", "mx", "tr", "jp"] as const;
export const DEVICES = ["computer", "high_end_phone", "low_end_phone", "high_end_tablet", "console"] as const;
export const PAGE_SIZE = 50;

export interface ScreenerFilters {
  q: string;
  launched: Launched;
  min: number;
  genres: string[];
  stages: Stage[];
  country: string | null;
  device: string | null;
  sort: SortKey;
  order: "desc" | "asc";
  limit: number;
}

export const DEFAULT_FILTERS: ScreenerFilters = {
  q: "",
  launched: "30",
  min: 0,
  genres: [],
  stages: [],
  country: null,
  device: null,
  sort: "players",
  order: "desc",
  limit: PAGE_SIZE,
};

export interface ScreenerRow {
  universeId: number;
  name: string;
  creatorName: string;
  genre: string;
  createdMs: number | null;
  cur7: number;
  prev7: number | null;
  peak7: number;
  wowPct: number | null;
  session: number | null; // estimated minutes
  favsPer1k: number | null; // favourites per 1,000 visits
  stage: Stage;
}

export interface ScreenerResult {
  asOfMs: number;
  day: string;
  matches: ScreenerRow[];
  // Counts across the other filters, so each option shows what picking it adds.
  genreCounts: [string, number][];
  stageCounts: Record<Stage, number>;
}

type Params = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const first = (v: string | string[] | undefined) => list(v)[0];
const pick = <T extends string>(options: readonly T[], v: string | undefined, fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

// Searching looks across every launch date unless a launch window is picked.
const defaultLaunched = (q: string): Launched => (q ? "any" : DEFAULT_FILTERS.launched);

export function parseFilters(sp: Params): ScreenerFilters {
  const q = (first(sp.q) ?? "").trim().slice(0, 200);
  const min = Number(first(sp.min));
  const limit = Number(first(sp.n));
  const country = first(sp.country);
  const device = first(sp.device);
  return {
    q,
    launched: pick(LAUNCHED, first(sp.launched), defaultLaunched(q)),
    min: (MIN_PLAYERS as readonly number[]).includes(min) ? min : 0,
    genres: [...new Set(list(sp.genre))].slice(0, 30),
    stages: [...new Set(list(sp.stage))].filter((s): s is Stage => (STAGES as string[]).includes(s)),
    country: (COUNTRIES as readonly string[]).includes(country ?? "") ? country! : null,
    device: (DEVICES as readonly string[]).includes(device ?? "") ? device! : null,
    sort: pick(SORTS, first(sp.sort), DEFAULT_FILTERS.sort),
    order: first(sp.order) === "asc" ? "asc" : "desc",
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : PAGE_SIZE,
  };
}

// The query string for a set of filters, leaving defaults out so links stay short.
export function filtersToQuery(f: ScreenerFilters, overrides: Partial<ScreenerFilters> = {}): string {
  const v = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (v.q) p.set("q", v.q);
  if (v.launched !== defaultLaunched(v.q)) p.set("launched", v.launched);
  if (v.min) p.set("min", String(v.min));
  for (const g of v.genres) p.append("genre", g);
  for (const s of v.stages) p.append("stage", s);
  if (v.country) p.set("country", v.country);
  if (v.device) p.set("device", v.device);
  if (v.sort !== DEFAULT_FILTERS.sort) p.set("sort", v.sort);
  if (v.order !== DEFAULT_FILTERS.order) p.set("order", v.order);
  if (v.limit !== PAGE_SIZE) p.set("n", String(v.limit));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const SORT_VALUES: Record<SortKey, (r: ScreenerRow) => number | null> = {
  players: (r) => r.cur7,
  wow: (r) => r.wowPct,
  session: (r) => r.session,
  favs: (r) => r.favsPer1k,
  newest: (r) => r.createdMs,
};

// Games without a value (too new for week on week, say) go last either way;
// ties fall back to more players first.
function sorter(f: ScreenerFilters) {
  const value = SORT_VALUES[f.sort];
  const dir = f.order === "asc" ? 1 : -1;
  return (a: ScreenerRow, b: ScreenerRow) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return va === vb ? b.cur7 - a.cur7 : va === null ? 1 : -1;
    return dir * (va - vb) || b.cur7 - a.cur7;
  };
}

// Genre and stage are filtered here rather than in SQL so their option counts
// can be worked out from the same rows.
export function applyFilters(rows: ScreenerRow[], f: ScreenerFilters): Omit<ScreenerResult, "asOfMs" | "day"> {
  const genreOk = (r: ScreenerRow) => f.genres.length === 0 || f.genres.includes(r.genre);
  const stageOk = (r: ScreenerRow) => f.stages.length === 0 || f.stages.includes(r.stage);

  const genreCounts = new Map<string, number>();
  for (const r of rows) if (stageOk(r)) genreCounts.set(r.genre, (genreCounts.get(r.genre) ?? 0) + 1);
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const r of rows) if (genreOk(r)) stageCounts[r.stage]++;

  return {
    matches: rows.filter((r) => genreOk(r) && stageOk(r)).sort(sorter(f)),
    genreCounts: [...genreCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    stageCounts,
  };
}

interface Row {
  universe_id: number;
  name: string;
  creator_name: string | null;
  genre: string;
  created_ms: number | null;
  cur7: number;
  prev7: number | null;
  peak7: number;
  days_tracked: number;
  session: number | null;
  fav: number | null;
  vis: number | null;
}

// Every game with readings in the last 7 days that passes the SQL-side
// filters. The weekly figures match loadWeekAggregates in game.ts.
export async function screenGames(db: Db, f: ScreenerFilters): Promise<ScreenerResult | null> {
  const [latest] = await db.query<{ as_of_ms: number | null; day: string | null }>(
    `select extract(epoch from max(ts))::float8 * 1000 as as_of_ms,
            ((max(ts) at time zone 'UTC')::date)::text as day
     from snapshots`,
  );
  if (!latest?.as_of_ms || !latest.day) return null;

  const params: unknown[] = [latest.day, f.min];
  const where: string[] = ["a.cur7 is not null", "a.cur7 >= $2"];
  if (f.launched !== "any") {
    params.push(Number(f.launched));
    where.push(`g.created_at >= $1::date - $${params.length}::int`);
  }
  const query = parseSearch(f.q);
  if (query) {
    const s = searchWhere(query, params.length + 1);
    params.push(s.param);
    where.push(s.sql);
  }
  for (const [value, column] of [
    [f.country, "countries"],
    [f.device, "devices"],
  ] as const) {
    if (!value) continue;
    params.push(value);
    where.push(
      `exists (select 1 from game_presence_daily pr where pr.universe_id = g.universe_id
               and pr.day > $1::date - 7 and $${params.length} = any(pr.${column}))`,
    );
  }

  const rows = await db.query<Row>(
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
     select g.universe_id::float8 as universe_id, g.name, g.creator_name, coalesce(g.genre_l1, 'Other') as genre,
            extract(epoch from g.created_at)::float8 * 1000 as created_ms,
            a.cur7::float8 as cur7, a.prev7::float8 as prev7,
            coalesce(p.peak7, a.cur7)::float8 as peak7, coalesce(p.days_tracked, 1) as days_tracked,
            (a.cm / nullif(a.vpm, 0))::float8 as session, a.fav::float8 as fav, a.vis::float8 as vis
     from agg a
     join games g using (universe_id)
     left join game_peaks p using (universe_id)
     where ${where.join(" and ")}`,
    params,
  );

  const asOfMs = latest.as_of_ms;
  const all: ScreenerRow[] = rows.map((r) => {
    const peak7 = Math.max(r.peak7, r.cur7);
    return {
      universeId: r.universe_id,
      name: r.name,
      creatorName: r.creator_name ?? "Unknown",
      genre: r.genre,
      createdMs: r.created_ms,
      cur7: r.cur7,
      prev7: r.prev7,
      peak7,
      wowPct: r.prev7 ? (100 * (r.cur7 - r.prev7)) / r.prev7 : null,
      session: r.session,
      favsPer1k: r.fav !== null && r.vis ? (1_000 * r.fav) / r.vis : null,
      stage: lifecycleStage({
        cur7: r.cur7,
        prev7: r.prev7,
        peak7,
        createdMs: r.created_ms,
        daysTracked: r.days_tracked,
        nowMs: asOfMs,
      }),
    };
  });
  return { asOfMs, day: latest.day, ...applyFilters(all, f) };
}

export const ageDays = (createdMs: number | null, nowMs: number) =>
  createdMs === null ? null : Math.max(0, Math.round((nowMs - createdMs) / DAY_MS));
