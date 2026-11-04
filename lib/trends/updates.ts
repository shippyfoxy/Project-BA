import type { Db } from "@/lib/db/client";
import { quantile } from "@/lib/stats";

// Two kinds of event:
// - a publish: Roblox's "updated" time changed. Studios publish small fixes
//   constantly, so most publishes are routine.
// - an announced update: the title's tag changed to a new one, the way
//   studios advertise a real update or event ("[UPD 21]", "[🎃 HALLOWEEN]").
// Lift compares average players on the two days after the event with the
// same two weekdays a week earlier, which cancels Roblox's weekly rhythm.

const DAY_MS = 86_400_000;
const MAX_DETECTION_GAP_MS = 36 * 3_600_000;
export const MIN_PLAYERS = 1_000;

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const TAG = /[[(]([^\])]*)[\])]/g;

// The bracketed tags in a title, normalised so "[ UPD 21 ]" and "[UPD 21]" match.
export function tagsOf(name: string): string[] {
  return [...name.matchAll(TAG)].map((m) => m[1].replace(EMOJI, "").replace(/\s+/g, " ").trim().toUpperCase() || "EMOJI");
}

// Countdowns ("[8H⏳]", "[1DAY]", "[SOON]") announce an update that has not
// happened yet, so they never count as one.
const COUNTDOWN = /^\d+\s*(S|SEC|M|MIN|MINS|H|HR|HRS|HOURS?|D|DAYS?)$|^\d+\s*(H|D)\s*\d+|SOON|COUNTDOWN|TOMORROW|TONIGHT|COMING/;

// A new tag appeared that the previous title did not have.
export function isAnnounced(prev: string, next: string): boolean {
  const before = new Set(tagsOf(prev));
  return tagsOf(next).some((t) => !before.has(t) && !COUNTDOWN.test(t));
}

export interface LiftSummary {
  events: number;
  games: number;
  median: number; // lift as a fraction: 0.05 = 5% more players
  p25: number;
  p75: number;
  shareUp: number;
}

export interface UpdateImpact {
  since: string;
  publishes: LiftSummary;
  announced: LiftSummary;
  // Median lift of announced updates by the UTC weekday they went out (1 = Monday).
  byWeekday: ({ dow: number } & LiftSummary)[];
  byGenre: ({ genre: string } & LiftSummary)[];
  recent: { universeId: number; name: string; prevName: string; genre: string; dayMs: number; lift: number; before: number }[];
  // Announced in the last few days: the result needs two complete days after.
  pending: { universeId: number; name: string; prevName: string; genre: string; dayMs: number; before: number; resultMs: number }[];
}

interface EventLift {
  universe_id: number;
  day: string;
  before: number;
  after: number;
}

function summarise(rows: { universe_id: number; lift: number }[]): LiftSummary {
  const lifts = rows.map((r) => r.lift).sort((a, b) => a - b);
  return {
    events: rows.length,
    games: new Set(rows.map((r) => r.universe_id)).size,
    median: quantile(lifts, 0.5),
    p25: quantile(lifts, 0.25),
    p75: quantile(lifts, 0.75),
    shareUp: rows.length ? rows.filter((r) => r.lift > 0).length / rows.length : NaN,
  };
}

// Before and after averages for (game, day) events, keeping games averaging
// MIN_PLAYERS+ the week before, with both days present on each side.
const LIFT_SQL = `
  with ev as (
    select distinct r.universe_id, r.day
    from jsonb_to_recordset($1::text::jsonb) as r(universe_id bigint, day date)
  )
  select ev.universe_id::float8 as universe_id, ev.day::text as day,
         avg(d.playing_avg) filter (where d.day in (ev.day - 6, ev.day - 5))::float8 as before,
         avg(d.playing_avg) filter (where d.day in (ev.day + 1, ev.day + 2))::float8 as after
  from ev
  join game_daily d on d.universe_id = ev.universe_id and d.day between ev.day - 6 and ev.day + 2
  -- The second day after must be complete, not today.
  where ev.day + 2 < (select max(day) from game_daily)
  group by ev.universe_id, ev.day
  having avg(d.playing_avg) filter (where d.day in (ev.day - 6, ev.day - 5)) >= ${MIN_PLAYERS}
     and count(*) filter (where d.day in (ev.day - 6, ev.day - 5)) = 2
     and count(*) filter (where d.day in (ev.day + 1, ev.day + 2)) = 2`;

// Players the week before, for events too recent to have a result yet.
const BEFORE_SQL = `
  with ev as (
    select distinct r.universe_id, r.day
    from jsonb_to_recordset($1::text::jsonb) as r(universe_id bigint, day date)
  )
  select ev.universe_id::float8 as universe_id, ev.day::text as day, avg(d.playing_avg)::float8 as before
  from ev
  join game_daily d on d.universe_id = ev.universe_id and d.day in (ev.day - 6, ev.day - 5)
  group by ev.universe_id, ev.day
  having count(*) = 2 and avg(d.playing_avg) >= ${MIN_PLAYERS}`;

export async function getUpdateImpact(db: Db): Promise<UpdateImpact | null> {
  const [range] = await db.query<{ first: string | null; last: string | null }>(
    `select min(day)::text as first, max(day)::text as last from game_daily`,
  );
  if (!range?.last) return null;

  // One publish event per game per day: several publishes in a day are one release.
  const publishes = await db.query<EventLift>(
    `with ev as (
       select distinct universe_id, (updated_at at time zone 'UTC')::date as day
       from game_updates
       -- max(day) is today, so D + 2 must be at most yesterday.
       where (updated_at at time zone 'UTC')::date between $1::date + 6 and $2::date - 3
     )
     select ev.universe_id::float8 as universe_id, ev.day::text as day,
            avg(d.playing_avg) filter (where d.day in (ev.day - 6, ev.day - 5))::float8 as before,
            avg(d.playing_avg) filter (where d.day in (ev.day + 1, ev.day + 2))::float8 as after
     from ev
     join game_daily d on d.universe_id = ev.universe_id and d.day between ev.day - 6 and ev.day + 2
     group by ev.universe_id, ev.day
     having avg(d.playing_avg) filter (where d.day in (ev.day - 6, ev.day - 5)) >= ${MIN_PLAYERS}
        and count(*) filter (where d.day in (ev.day - 6, ev.day - 5)) = 2
        and count(*) filter (where d.day in (ev.day + 1, ev.day + 2)) = 2`,
    [range.first, range.last],
  );

  // Title changes spotted within 36 hours of the previous sighting.
  const titles = await db.query<{ universe_id: number; name: string; prev_name: string; genre: string; first_ms: number; prev_ms: number }>(
    `select * from (
       select n.universe_id::float8 as universe_id, n.name, coalesce(nullif(g.genre_l1, 'All'), 'Other') as genre,
              lag(n.name) over w as prev_name,
              extract(epoch from n.first_seen)::float8 * 1000 as first_ms,
              extract(epoch from n.prev_seen)::float8 * 1000 as prev_ms
       from game_names n join games g using (universe_id)
       window w as (partition by n.universe_id order by n.first_seen)
     ) t
     where prev_name is not null and prev_ms is not null and first_ms - prev_ms <= ${MAX_DETECTION_GAP_MS}`,
  );
  const announced = titles.filter((t) => isAnnounced(t.prev_name, t.name));
  const evDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const announcedLifts = announced.length
    ? await db.query<EventLift>(LIFT_SQL, [JSON.stringify(announced.map((t) => ({ universe_id: t.universe_id, day: evDay(t.first_ms) })))])
    : [];

  const withLift = (rows: EventLift[]) => rows.map((r) => ({ ...r, lift: r.after / r.before - 1 }));
  const pubLifts = withLift(publishes);
  const annLifts = withLift(announcedLifts);
  const byKey = new Map(annLifts.map((r) => [`${r.universe_id}|${r.day}`, r]));

  const weekday = new Map<number, number[]>();
  const genre = new Map<string, number[]>();
  const recent: UpdateImpact["recent"] = [];
  const counted = new Set<string>();
  for (const t of announced) {
    const day = evDay(t.first_ms);
    const key = `${t.universe_id}|${day}`;
    const r = byKey.get(key);
    // Several tag changes in one day are one event.
    if (!r || counted.has(key)) continue;
    counted.add(key);
    const dow = ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    weekday.set(dow, [...(weekday.get(dow) ?? []), r.lift]);
    genre.set(t.genre, [...(genre.get(t.genre) ?? []), r.lift]);
    recent.push({ universeId: t.universe_id, name: t.name, prevName: t.prev_name, genre: t.genre, dayMs: Date.parse(day), lift: r.lift, before: r.before });
  }
  const stats = (xs: number[]) => summarise(xs.map((lift) => ({ universe_id: 0, lift })));

  // Too recent for a result: day + 2 is today or later.
  const cutoff = Date.parse(range.last) - 3 * DAY_MS;
  const fresh = announced.filter((t) => Date.parse(evDay(t.first_ms)) > cutoff);
  const befores = fresh.length
    ? await db.query<{ universe_id: number; day: string; before: number }>(BEFORE_SQL, [
        JSON.stringify(fresh.map((t) => ({ universe_id: t.universe_id, day: evDay(t.first_ms) }))),
      ])
    : [];
  const beforeBy = new Map(befores.map((b) => [`${b.universe_id}|${b.day}`, b.before]));
  const pendingSeen = new Set<string>();
  const pending: UpdateImpact["pending"] = [];
  for (const t of fresh) {
    const day = evDay(t.first_ms);
    const key = `${t.universe_id}|${day}`;
    const before = beforeBy.get(key);
    if (before === undefined || pendingSeen.has(key)) continue;
    pendingSeen.add(key);
    const dayMs = Date.parse(day);
    pending.push({ universeId: t.universe_id, name: t.name, prevName: t.prev_name, genre: t.genre, dayMs, before, resultMs: dayMs + 3 * DAY_MS });
  }

  return {
    since: range.first!,
    publishes: summarise(pubLifts),
    announced: summarise(annLifts),
    byWeekday: [...weekday].map(([dow, xs]) => ({ dow, ...stats(xs) })).sort((a, b) => a.dow - b.dow),
    byGenre: [...genre]
      .filter(([, xs]) => xs.length >= 30)
      .map(([g, xs]) => ({ genre: g, ...stats(xs) }))
      .sort((a, b) => b.median - a.median),
    recent: recent.sort((a, b) => b.dayMs - a.dayMs).slice(0, 40),
    pending: pending.sort((a, b) => b.dayMs - a.dayMs || b.before - a.before).slice(0, 20),
  };
}

export interface GameUpdates {
  publishes30: number; // days with a publish in the last 30 days
  lastPublishMs: number | null;
  announced: { dayMs: number; name: string; prevName: string; lift: number | null }[];
}

// One game's publishing rhythm and its announced updates, newest first.
export async function getGameUpdates(db: Db, universeId: number): Promise<GameUpdates> {
  const [pub] = await db.query<{ days30: number; last_ms: number | null }>(
    `select count(distinct (updated_at at time zone 'UTC')::date) filter (where updated_at > now() - interval '30 days')::int as days30,
            extract(epoch from max(updated_at))::float8 * 1000 as last_ms
     from game_updates where universe_id = $1::bigint`,
    [universeId],
  );
  const titles = await db.query<{ name: string; prev_name: string | null; first_ms: number; prev_ms: number | null }>(
    `select name, lag(name) over (order by first_seen) as prev_name,
            extract(epoch from first_seen)::float8 * 1000 as first_ms,
            extract(epoch from prev_seen)::float8 * 1000 as prev_ms
     from game_names where universe_id = $1::bigint order by first_seen`,
    [universeId],
  );
  const events = titles
    .filter((t) => t.prev_name && t.prev_ms && t.first_ms - t.prev_ms <= MAX_DETECTION_GAP_MS && isAnnounced(t.prev_name, t.name))
    .map((t) => ({ day: new Date(t.first_ms).toISOString().slice(0, 10), name: t.name, prevName: t.prev_name! }));
  const lifts = events.length
    ? await db.query<EventLift>(LIFT_SQL, [JSON.stringify(events.map((e) => ({ universe_id: universeId, day: e.day })))])
    : [];
  const liftByDay = new Map(lifts.map((l) => [l.day, l.after / l.before - 1]));
  return {
    publishes30: pub?.days30 ?? 0,
    lastPublishMs: pub?.last_ms ?? null,
    announced: events
      .map((e) => ({ dayMs: Date.parse(e.day), name: e.name, prevName: e.prevName, lift: liftByDay.get(e.day) ?? null }))
      .reverse()
      .slice(0, 8),
  };
}
