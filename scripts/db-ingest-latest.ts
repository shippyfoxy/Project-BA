// Records data/snapshots/latest.json in the database. Runs in the refresh
// workflow after refresh-data and validate-snapshot, so only validated data
// reaches Neon. Re-running for the same snapshot is a no-op.

import { promises as fs } from "node:fs";
import path from "node:path";
import { recordSnapshot } from "../lib/db/live";
import { applyMigrations } from "../lib/db/migrate";
import type { IngestSnapshot } from "../lib/db/ingest";
import { openDb } from "./_db";

const SNAPSHOT_PATH = path.resolve(process.cwd(), "data/snapshots/latest.json");

async function main() {
  const snap = JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8")) as IngestSnapshot;
  const { db, label } = await openDb();
  try {
    const applied = await applyMigrations(db);
    if (applied.length) console.log(`[ingest] applied migrations: ${applied.join(", ")}`);
    const r = await recordSnapshot(db, snap);
    if (r.skipped) {
      console.log(`[ingest] ${label}: snapshot ${snap.generatedAt} already recorded, nothing to do`);
    } else {
      console.log(
        `[ingest] ${label}: recorded ${snap.generatedAt}: ${r.games} games, ${r.observations} readings ` +
          `(${r.idle} idle games skipped, ${r.droppedInvalid} malformed rows dropped); ` +
          `rolled up ${r.rolledUpRows} daily rows, updated ${r.peaksUpdated} peaks, pruned ${r.prunedRows} old readings`,
      );
    }
    // Neon's free tier allows 1 GB; warn well before it fills.
    const [size] = await db.query<{ mb: number }>("select pg_database_size(current_database()) / 1e6 as mb");
    const mb = Number(size.mb);
    const msg = `[ingest] database size ${mb.toFixed(0)} MB of the 1,000 MB free tier`;
    if (mb > 800) console.warn(`::warning::${msg}`);
    else console.log(msg);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exit(1);
});
