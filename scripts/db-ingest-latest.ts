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
        `[ingest] ${label}: recorded ${snap.generatedAt}: ${r.games} games, ${r.observations} readings, ` +
          `${r.droppedInvalid} malformed rows dropped; rolled up ${r.rolledUpRows} daily rows, pruned ${r.prunedRows} old readings`,
      );
    }
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exit(1);
});
