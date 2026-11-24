import type { Db } from "@/lib/db/client";

// How long a hit holds its players: days from its best week until its 7-day
// average first falls below half, and below a tenth, of that best week.
// Every game that reached HIT_PLAYERS is measured; the benchmarks use only
// games made since tracking began with a full best week, so the peak is
// really theirs. Until 25 October a game was read only while in the discovery
// lists, so a fall can hide in a gap: each crossing is then known only to lie
// between the last reading before the gap and the first after it, and the
// medians are given for both ends. Games still above the line are counted as
// "not yet" (censored), so the medians are Kaplan-Meier, not just the
// games that already fell.
export const HIT_PLAYERS = 5_000;
export const HITS_FROM = "2026-04-15";
const MIN_HITS = 8;

export interface HitLife {
  universeId: number;
  fresh: boolean; // made since tracking began, so its peak is really its own; only these set the benchmarks
  genre: string;
  subgenre: string | null;
  peak7: number;
  peakDayMs: number;
  half: number | null; // days to half (first reading below it), null while still above
  halfEarly: number | null; // the earliest it could have been: the day after the reading before
  tenth: number | null;
  tenthEarly: number | null;
  followed: number; // days of history after the peak
}

export interface LifeSummary {
  group: string; // subgenre, genre or "Every hit"
  n: number;
  halfMedian: number | null; // null when fewer than half have fallen yet
  halfEarly: number | null; // the same median with every crossing at its earliest possible day
  tenthMedian: number | null;
  tenthEarly: number | null;
  stillAboveHalf: number; // share still above half today
}

// "12 days", or "9 to 12 days" when gaps in the readings leave a range.
export const fmtDays = (early: number | null, late: number | null) =>
  late === null ? null : early !== null && early < late ? `${early} to ${late}` : `${late}`;

// Kaplan-Meier median: the time by which half the games have crossed, counting
// games still above the line for as long as they have been followed.
export function kmMedian(rows: { t: number; event: boolean }[]): number | null {
  const sorted = [...rows].sort((a, b) => a.t - b.t || Number(b.event) - Number(a.event));
  let atRisk = sorted.length;
  let surv = 1;
  for (let i = 0; i < sorted.length; ) {
    const t = sorted[i].t;
    let events = 0;
    let leaving = 0;
    while (i < sorted.length && sorted[i].t === t) {
      if (sorted[i].event) events++;
      leaving++;
      i++;
    }
    if (events) {
      surv *= 1 - events / atRisk;
      if (surv <= 0.5) return t;
    }
    atRisk -= leaving;
  }
  return null;
}

export function summarise(group: string, hits: HitLife[]): LifeSummary {
  const at = (k: "half" | "tenth" | "halfEarly" | "tenthEarly") => hits.map((h) => ({ t: h[k] ?? h.followed, event: h[k] !== null }));
  return {
    group,
    n: hits.length,
    halfMedian: kmMedian(at("half")),
    halfEarly: kmMedian(at("halfEarly")),
    tenthMedian: kmMedian(at("tenth")),
    tenthEarly: kmMedian(at("tenthEarly")),
    stillAboveHalf: hits.filter((h) => h.half === null).length / Math.max(hits.length, 1),
  };
}

// The game's own subgenre if it has enough hits, else its genre, else every hit.
export function lifeFor(all: HitLife[], genre: string, subgenre: string | null): LifeSummary {
  const hits = all.filter((h) => h.fresh);
  const sub = subgenre ? hits.filter((h) => h.subgenre === subgenre) : [];
  if (sub.length >= MIN_HITS) return summarise(subgenre!, sub);
  const gen = hits.filter((h) => h.genre === genre);
  if (gen.length >= MIN_HITS) return summarise(genre, gen);
  return summarise("Every hit", hits);
}

export async function getHitLives(db: Db): Promise<HitLife[]> {
  const rows = await db.query<{
    universe_id: number;
    fresh: boolean;
    genre: string;
    subgenre: string | null;
    peak7: number;
    peak_ms: number;
    half: number | null;
    half_early: number | null;
    tenth: number | null;
    tenth_early: number | null;
    followed: number;
  }>(
    `with hits as (
       select g.universe_id, g.created_at >= $1::date and p.peak7_full as fresh, coalesce(nullif(g.genre_l1, 'All'), 'Other') as genre, nullif(g.genre_l2, '') as subgenre, p.peak7, p.peak7_day
       from games g join game_peaks p using (universe_id)
       where p.peak7 >= $2
     ), r as (
       select d.universe_id, d.day, lag(d.day) over (partition by d.universe_id order by d.day) as prev_day,
              avg(d.playing_avg) over (partition by d.universe_id order by d.day range between interval '6 days' preceding and current row) as a7
       from game_daily d
       where d.universe_id in (select universe_id from hits) and d.day < (select max(day) from game_daily)
     )
     select h.universe_id::float8 as universe_id, h.fresh, h.genre, h.subgenre, h.peak7::float8 as peak7,
            extract(epoch from h.peak7_day)::float8 * 1000 as peak_ms,
            min(r.day - h.peak7_day) filter (where r.day > h.peak7_day and r.a7 < 0.5 * h.peak7) as half,
            (array_agg(greatest(r.prev_day + 1, h.peak7_day + 1) - h.peak7_day order by r.day) filter (where r.day > h.peak7_day and r.a7 < 0.5 * h.peak7))[1] as half_early,
            min(r.day - h.peak7_day) filter (where r.day > h.peak7_day and r.a7 < 0.1 * h.peak7) as tenth,
            (array_agg(greatest(r.prev_day + 1, h.peak7_day + 1) - h.peak7_day order by r.day) filter (where r.day > h.peak7_day and r.a7 < 0.1 * h.peak7))[1] as tenth_early,
            greatest(max(r.day) - h.peak7_day, 0) as followed
     from hits h join r using (universe_id)
     group by h.universe_id, h.fresh, h.genre, h.subgenre, h.peak7, h.peak7_day`,
    [HITS_FROM, HIT_PLAYERS],
  );
  return rows.map((r) => ({
    universeId: r.universe_id,
    fresh: r.fresh,
    genre: r.genre,
    subgenre: r.subgenre,
    peak7: r.peak7,
    peakDayMs: r.peak_ms,
    half: r.half,
    halfEarly: r.half_early ?? r.half,
    tenth: r.tenth,
    tenthEarly: r.tenth_early ?? r.tenth,
    followed: r.followed,
  }));
}

// Hits grouped by how many days they published in the 14 days before their
// best week. Before the peak every game is in the discovery lists and read
// hourly, so publishes there are complete; after it, a fading game drops out
// of the lists and its publishes go unseen, which would flatter frequent updaters.
export const PUBLISH_BANDS: [number, number][] = [
  [0, 1],
  [2, 4],
  [5, 8],
  [9, 14],
];

export async function cadenceLives(db: Db, all: HitLife[]): Promise<(LifeSummary & { lo: number; hi: number })[]> {
  // Publishes were recorded from 7 May, so the 14 days before the peak must fall after that.
  const hits = all.filter((h) => h.fresh && h.peakDayMs >= Date.UTC(2026, 4, 21));
  if (!hits.length) return [];
  const pub = await db.query<{ id: number; n: number }>(
    `select h.id::float8 as id, count(distinct (u.updated_at at time zone 'UTC')::date)::int as n
     from (select unnest($1::bigint[]) as id, unnest($2::date[]) as d) h
     left join game_updates u on u.universe_id = h.id and u.updated_at >= h.d - 14 and u.updated_at < h.d
     group by 1`,
    [hits.map((h) => h.universeId), hits.map((h) => new Date(h.peakDayMs).toISOString().slice(0, 10))],
  );
  const n = new Map(pub.map((p) => [p.id, p.n]));
  return PUBLISH_BANDS.map(([lo, hi]) => ({
    lo,
    hi,
    ...summarise(`${lo} to ${hi}`, hits.filter((h) => (n.get(h.universeId) ?? 0) >= lo && (n.get(h.universeId) ?? 0) <= hi)),
  }));
}
