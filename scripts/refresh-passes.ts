// Reads the game passes of games averaging 1,000+ players, once a day each.
// Runs after the Welcome badges in every refresh and, like them, takes the next
// batch of games not yet read today, so all are covered within a few hours.

import { getGamePasses } from "../lib/roblox/client";
import { applyMigrations } from "../lib/db/migrate";
import { argValue, openDb } from "./_db";

const PER_RUN = Number(argValue("--limit") ?? 200);

const UPSERT = `
  insert into game_passes (pass_id, universe_id, name, price, for_sale, created_at, updated_at, first_seen, last_seen)
  select x.pass_id, $1::bigint, x.name, x.price, x.for_sale, x.created_at, x.updated_at, $2::date, $2::date
  from jsonb_to_recordset($3::text::jsonb) as x(pass_id bigint, name text, price integer, for_sale boolean, created_at timestamptz, updated_at timestamptz)
  on conflict (pass_id) do update set
    universe_id = excluded.universe_id, name = excluded.name, price = excluded.price, for_sale = excluded.for_sale,
    created_at = excluded.created_at, updated_at = excluded.updated_at, last_seen = excluded.last_seen`;

async function main() {
  const { db, label } = await openDb();
  try {
    await applyMigrations(db);
    const due = await db.query<{ id: number }>(
      `with latest as (select (max(ts) at time zone 'UTC')::date - 1 as day from snapshots)
       select g.universe_id::float8 as id
       from games g, latest,
            lateral (select avg(d.playing_avg) as cur7 from game_daily d
                     where d.universe_id = g.universe_id and d.day > latest.day - 7 and d.day <= latest.day) c
       where c.cur7 >= 1000
         and not exists (select 1 from game_pass_reads r
                         where r.universe_id = g.universe_id and r.read_on = (now() at time zone 'UTC')::date)
       order by c.cur7 desc
       limit $1`,
      [PER_RUN],
    );
    let passes = 0;
    let failed = 0;
    for (const { id } of due) {
      try {
        const list = await getGamePasses(id, { retries: 2 });
        const day = new Date().toISOString().slice(0, 10);
        const rows = list.map((p) => ({
          pass_id: p.id,
          name: (p.displayName || p.name || "").slice(0, 200),
          price: p.isForSale && typeof p.price === "number" ? p.price : null,
          for_sale: p.isForSale,
          created_at: p.created ?? null,
          updated_at: p.updated ?? null,
        }));
        await db.transaction(async (tx) => {
          if (rows.length) await tx.query(UPSERT, [id, day, JSON.stringify(rows)]);
          await tx.query(
            `insert into game_pass_reads (universe_id, read_on, passes) values ($1, $2::date, $3)
             on conflict (universe_id) do update set read_on = excluded.read_on, passes = excluded.passes`,
            [id, day, rows.length],
          );
        });
        passes += rows.length;
      } catch (err) {
        failed++;
        if (failed <= 3) console.warn(`[passes] ${id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`[passes] ${label}: read ${due.length - failed} games, ${passes} passes, ${failed} failed`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[passes] failed:", err);
  process.exit(1);
});
