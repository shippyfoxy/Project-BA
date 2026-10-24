// Imports every committed version of data/snapshots/latest.json into Postgres.
//
//   pnpm db:backfill                      # into DATABASE_URL (Neon)
//   pnpm db:backfill --pglite .pglite     # into a local PGlite database
//   pnpm db:backfill --dry-run            # parse history only, no database
//   pnpm db:backfill --limit 50           # first N versions only
//
// Safe to re-run: snapshots already in the database are skipped, so an
// interrupted run resumes where it stopped.

import { listSnapshotVersions, readBlobs } from "../lib/db/git-snapshots";
import { applyMigrations } from "../lib/db/migrate";
import {
  DAY_MS,
  ingestSnapshot,
  pruneObservations,
  retentionCutoff,
  rollupDays,
  snapshotTs,
  startOfUtcDay,
  utcDay,
  type IngestSnapshot,
} from "../lib/db/ingest";
import type { Db } from "../lib/db/client";
import { argValue, hasFlag, openDb } from "./_db";

const FILE = "data/snapshots/latest.json";

interface Stats {
  versions: number;
  parseFailures: number;
  duplicates: number;
  ingested: number;
  alreadyInDb: number;
  observations: number;
  sampleOnlyReadings: number;
  droppedInvalid: number;
  universes: Set<number>;
  firstTs: number;
  lastTs: number;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

// Days before this were rolled up and pruned by an earlier run, so their
// game_daily rows are final and new readings for them must be dropped.
async function loadWatermark(db: Db): Promise<number> {
  const [row] = await db.query<{ wm: string | null }>(`
    select coalesce(
      (select (date_trunc('day', min(ts) at time zone 'UTC') at time zone 'UTC')::text from observations),
      (select ((max(day) + 1)::timestamp at time zone 'UTC')::text from game_daily)
    ) as wm
  `);
  return row?.wm ? Date.parse(row.wm) : -Infinity;
}

async function reportSize(db: Db) {
  const tables = ["games", "snapshots", "observations", "game_daily", "game_presence_daily"];
  for (const t of tables) {
    const [r] = await db.query<{ n: number; bytes: number }>(
      `select (select count(*) from ${t})::int as n, pg_total_relation_size('${t}')::float8 as bytes`,
    );
    console.log(`[backfill]   ${t.padEnd(20)} ${String(r.n).padStart(10)} rows  ${(r.bytes / 1e6).toFixed(1).padStart(7)} MB`);
  }
  const [db_] = await db.query<{ bytes: number }>(
    "select pg_database_size(current_database())::float8 as bytes",
  );
  console.log(`[backfill]   database total ${(db_.bytes / 1e6).toFixed(1)} MB`);
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const limit = Number(argValue("--limit") ?? Infinity);
  const t0 = Date.now();

  const versions = listSnapshotVersions(FILE).slice(0, limit);
  console.log(`[backfill] ${versions.length} versions of ${FILE} in git history`);

  let db: Db | null = null;
  const known = new Set<number>();
  let watermark = -Infinity;
  if (!dryRun) {
    const opened = await openDb();
    db = opened.db;
    const applied = await applyMigrations(db);
    if (applied.length) console.log(`[backfill] applied migrations: ${applied.join(", ")}`);
    for (const r of await db.query<{ ts: Date }>("select ts from snapshots")) known.add(new Date(r.ts).getTime());
    watermark = await loadWatermark(db);
    console.log(
      `[backfill] target ${opened.label}: ${known.size} snapshots already present` +
        (Number.isFinite(watermark) ? `, finalised before ${utcDay(watermark)}` : ""),
    );
  }

  const stats: Stats = {
    versions: 0,
    parseFailures: 0,
    duplicates: 0,
    ingested: 0,
    alreadyInDb: 0,
    observations: 0,
    sampleOnlyReadings: 0,
    droppedInvalid: 0,
    universes: new Set(),
    firstTs: Infinity,
    lastTs: -Infinity,
  };
  const seen = new Set<number>(known);
  // Exclusive upper bound of days already rolled up in this run.
  let rolledThrough = Number.isFinite(watermark) ? watermark : -Infinity;
  const cutoff = retentionCutoff(Date.now());

  // readBlobs yields in request order, so the index identifies the commit
  // even when two commits share identical content.
  for await (const { content } of readBlobs(versions.map((v) => v.blob))) {
    const version = versions[stats.versions];
    stats.versions++;

    let snap: IngestSnapshot;
    let ts: number;
    try {
      snap = JSON.parse(content) as IngestSnapshot;
      ts = snapshotTs(snap);
    } catch (err) {
      stats.parseFailures++;
      console.warn(`[backfill] ${version.commit.slice(0, 7)} unreadable: ${(err as Error).message.slice(0, 120)}`);
      continue;
    }
    if (known.has(ts)) {
      stats.alreadyInDb++;
      continue;
    }
    if (seen.has(ts)) {
      stats.duplicates++;
      continue;
    }

    // A sample whose timestamp matches an earlier snapshot is the same reading
    // that snapshot already stored with full detail. Keeping only the rest
    // recovers refresh runs that were never committed, without re-upserting
    // ~48 duplicate readings per game per version.
    for (const g of snap.games ?? []) {
      stats.universes.add(g.universeId);
      if (g.samples) g.samples = g.samples.filter((s) => s.ts !== ts && !seen.has(s.ts));
      stats.sampleOnlyReadings += g.samples?.length ?? 0;
    }
    seen.add(ts);
    stats.firstTs = Math.min(stats.firstTs, ts);
    stats.lastTs = Math.max(stats.lastTs, ts);

    if (db) {
      const res = await ingestSnapshot(db, snap, {
        gitSha: version.commit,
        includeSamples: true,
        minTs: watermark,
      });
      stats.ingested++;
      stats.observations += res.observations;
      stats.droppedInvalid += res.droppedInvalid;

      if (!Number.isFinite(rolledThrough)) rolledThrough = startOfUtcDay(res.earliestTs ?? ts);

      // A late or out-of-order reading landed in a day already rolled up.
      if (res.earliestTs !== null && res.earliestTs < rolledThrough) {
        await rollupDays(db, utcDay(Math.max(res.earliestTs, watermark)), utcDay(rolledThrough));
      }

      // Rolling samples reach back 24 hours, so day D-1 can still change
      // while snapshots from day D are arriving. Days before that are final.
      const completeBefore = startOfUtcDay(ts) - DAY_MS;
      if (completeBefore > rolledThrough) {
        await rollupDays(db, utcDay(rolledThrough), utcDay(completeBefore));
        rolledThrough = completeBefore;
        const pruneBefore = Math.min(cutoff, completeBefore);
        if (pruneBefore > watermark) {
          await pruneObservations(db, pruneBefore);
          watermark = pruneBefore;
          // Bulk deletes and upserts leave dead rows; without this the import
          // grows files to several times the live data size (~600 MB vs ~85 MB).
          await db.exec("vacuum observations, game_presence_daily, games");
        }
      }
    }

    if (stats.versions % 50 === 0) {
      const elapsed = Date.now() - t0;
      const eta = (elapsed / stats.versions) * (versions.length - stats.versions);
      console.log(
        `[backfill] ${stats.versions}/${versions.length}  ${utcDay(ts)}  ` +
          `${stats.observations.toLocaleString("en-GB")} readings  ${fmtDuration(elapsed)} elapsed, ~${fmtDuration(eta)} left`,
      );
    }
  }

  if (db) {
    if (Number.isFinite(rolledThrough)) {
      await rollupDays(db, utcDay(rolledThrough), utcDay(startOfUtcDay(Date.now()) + 2 * DAY_MS));
    }
    // Never prune the newest two days: a later run (or the live refresh) may
    // still add readings to them, and once pruned they could not be re-rolled.
    let newest = -Infinity;
    for (const t of seen) newest = Math.max(newest, t);
    const finalPrune = Math.min(cutoff, startOfUtcDay(newest) - DAY_MS);
    if (finalPrune > watermark) await pruneObservations(db, finalPrune);
    await db.exec("vacuum analyze");
  }

  console.log(`[backfill] done in ${fmtDuration(Date.now() - t0)}${dryRun ? " (dry run)" : ""}`);
  console.log(
    `[backfill]   versions read ${stats.versions}, unreadable ${stats.parseFailures}, ` +
      `duplicate timestamps ${stats.duplicates}, already in db ${stats.alreadyInDb}`,
  );
  if (Number.isFinite(stats.firstTs)) {
    console.log(
      `[backfill]   ${stats.universes.size.toLocaleString("en-GB")} unique games, ` +
        `${new Date(stats.firstTs).toISOString()} to ${new Date(stats.lastTs).toISOString()}`,
    );
  }
  console.log(
    `[backfill]   readings recovered only from samples: ${stats.sampleOnlyReadings.toLocaleString("en-GB")}`,
  );
  if (db) {
    console.log(
      `[backfill]   ingested ${stats.ingested} snapshots, ${stats.observations.toLocaleString("en-GB")} readings, ` +
        `${stats.droppedInvalid} malformed rows dropped`,
    );
    await reportSize(db);
    await db.close();
  }
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
