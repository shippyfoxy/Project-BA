// Reads the Welcome badge of games averaging 1,000+ players, once a day each.
// Runs after db:ingest in every refresh; each run takes the next batch of
// games not yet read today, so the whole set is covered within a few hours
// without adding much to any one run.

import { getBadges } from "../lib/roblox/client";
import { applyMigrations } from "../lib/db/migrate";
import { pickWelcomeBadge } from "../lib/trends/welcome";
import { argValue, openDb } from "./_db";

const PER_RUN = Number(argValue("--limit") ?? 250);

// Visits over the 24 hours to the latest reading, scaled to exactly 24 hours.
// The earlier reading is the last one at least 22 hours before, and no more
// than 36.
const INSERT = `
  insert into welcome_badges (universe_id, day, ts, badge_id, badge_name, new_players, visits_24h)
  select $1::bigint, ($2::timestamptz at time zone 'UTC')::date, $2::timestamptz, $3::bigint, $4, $5::int,
         (select round((b.visits - a.visits) * 86400 / extract(epoch from b.ts - a.ts))
          from (select ts, visits from observations where universe_id = $1::bigint order by ts desc limit 1) b,
               lateral (select ts, visits from observations
                        where universe_id = $1::bigint and ts <= b.ts - interval '22 hours'
                        order by ts desc limit 1) a
          where b.ts - a.ts <= interval '36 hours')
  on conflict (universe_id, day) do nothing`;

async function main() {
  const { db, label } = await openDb();
  try {
    await applyMigrations(db);
    const due = await db.query<{ id: number; created_ms: number | null }>(
      `with latest as (select (max(ts) at time zone 'UTC')::date - 1 as day from snapshots)
       select g.universe_id::float8 as id, extract(epoch from g.created_at)::float8 * 1000 as created_ms
       from games g, latest,
            lateral (select avg(d.playing_avg) as cur7 from game_daily d
                     where d.universe_id = g.universe_id and d.day > latest.day - 7 and d.day <= latest.day) c
       where c.cur7 >= 1000
         and not exists (select 1 from welcome_badges w
                         where w.universe_id = g.universe_id
                           and (w.day = (now() at time zone 'UTC')::date
                                or (w.badge_id is null and w.day > (now() at time zone 'UTC')::date - 7)))
       order by c.cur7 desc
       limit $1`,
      [PER_RUN],
    );
    let found = 0;
    let failed = 0;
    for (const { id, created_ms } of due) {
      try {
        const badges = await getBadges(id, { retries: 2 });
        const ts = Date.now();
        const w = pickWelcomeBadge(badges, ts, created_ms);
        await db.query(INSERT, [id, new Date(ts).toISOString(), w?.id ?? null, w?.name ?? null, w?.statistics.pastDayAwardedCount ?? null]);
        if (w) found++;
      } catch (err) {
        failed++;
        if (failed <= 3) console.warn(`[badges] ${id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`[badges] ${label}: read ${due.length - failed} games, ${found} with a Welcome badge, ${failed} failed`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[badges] failed:", err);
  process.exit(1);
});
