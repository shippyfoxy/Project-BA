// Recovers publish times and title changes from the snapshots committed to
// git before the database existed (May to 24 October 2026). Run once, before
// the hourly ingest starts recording them, so titles stay in time order.
// Re-running is safe: existing rows are left alone.
//
//   pnpm tsx --env-file-if-exists=.env.local scripts/db-backfill-updates.ts [--pglite dir]

import { listSnapshotVersions, readBlobs } from "../lib/db/git-snapshots";
import { applyMigrations } from "../lib/db/migrate";
import { snapshotTs, UPDATES_INSERT, type IngestSnapshot } from "../lib/db/ingest";
import { openDb } from "./_db";

const FILE = "data/snapshots/latest.json";
const BATCH = 5_000;

async function main() {
  const t0 = Date.now();
  const { db, label } = await openDb();
  try {
    const applied = await applyMigrations(db);
    if (applied.length) console.log(`[updates] applied migrations: ${applied.join(", ")}`);
    const known = new Set((await db.query<{ id: number }>("select universe_id::float8 as id from games")).map((r) => r.id));

    const versions = listSnapshotVersions(FILE);
    console.log(`[updates] ${versions.length} snapshot versions in git; ${known.size} games in ${label}`);

    const firstSeenUpdate = new Map<string, number>(); // "id|updatedIso" -> first snapshot ts that showed it
    const lastName = new Map<number, string>();
    const lastSeen = new Map<number, number>();
    const names: { universe_id: number; name: string; first_seen: string; prev_seen: string | null }[] = [];
    let parsed = 0;

    for await (const { content } of readBlobs(versions.map((v) => v.blob))) {
      let snap: IngestSnapshot;
      let ts: number;
      try {
        snap = JSON.parse(content) as IngestSnapshot;
        ts = snapshotTs(snap);
      } catch {
        continue;
      }
      parsed++;
      for (const g of snap.games ?? []) {
        if (!known.has(g.universeId) || !g.name) continue;
        if (g.updated && Number.isFinite(Date.parse(g.updated))) {
          const key = `${g.universeId}|${new Date(g.updated).toISOString()}`;
          if (!firstSeenUpdate.has(key)) firstSeenUpdate.set(key, ts);
        }
        if (lastName.get(g.universeId) !== g.name) {
          const prev = lastSeen.get(g.universeId);
          names.push({
            universe_id: g.universeId,
            name: g.name,
            first_seen: new Date(ts).toISOString(),
            prev_seen: prev === undefined ? null : new Date(prev).toISOString(),
          });
          lastName.set(g.universeId, g.name);
        }
        lastSeen.set(g.universeId, ts);
      }
      if (parsed % 200 === 0) console.log(`[updates]   ${parsed} snapshots read`);
    }

    // Publishes, grouped by the snapshot that first showed them.
    const bySeen = new Map<number, { universe_id: number; updated_at: string }[]>();
    for (const [key, seen] of firstSeenUpdate) {
      const [id, updatedAt] = key.split("|");
      bySeen.set(seen, [...(bySeen.get(seen) ?? []), { universe_id: Number(id), updated_at: updatedAt }]);
    }
    let updateRows = 0;
    for (const [seen, rows] of bySeen) {
      for (let i = 0; i < rows.length; i += BATCH) {
        await db.query(UPDATES_INSERT, [JSON.stringify(rows.slice(i, i + BATCH)), new Date(seen).toISOString()]);
      }
      updateRows += rows.length;
    }

    for (let i = 0; i < names.length; i += BATCH) {
      await db.query(
        `insert into game_names (universe_id, name, first_seen, prev_seen)
         select r.universe_id, r.name, r.first_seen, r.prev_seen
         from jsonb_to_recordset($1::text::jsonb) as r(universe_id bigint, name text, first_seen timestamptz, prev_seen timestamptz)
         on conflict do nothing`,
        [JSON.stringify(names.slice(i, i + BATCH))],
      );
    }

    // Titles were not recorded between the last git snapshot and now. Where a
    // game's current title differs, it is seeded with no prev_seen: the change
    // happened at an unknown time, so it never counts in the lift analysis.
    const seeded = await db.query<{ n: number }>(
      `with ins as (
         insert into game_names (universe_id, name, first_seen, prev_seen)
         select g.universe_id, g.name, now(), null from games g
         where g.name is distinct from (select n.name from game_names n where n.universe_id = g.universe_id order by n.first_seen desc limit 1)
         on conflict do nothing
         returning 1)
       select count(*)::int as n from ins`,
    );

    const [counts] = await db.query<{ updates: number; names: number }>(
      "select (select count(*) from game_updates)::int as updates, (select count(*) from game_names)::int as names",
    );
    console.log(
      `[updates] ${parsed} snapshots: ${updateRows} publishes and ${names.length} titles found; ${seeded[0].n} current titles seeded. ` +
        `Tables now hold ${counts.updates} publishes and ${counts.names} titles. ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[updates] failed:", err);
  process.exit(1);
});
