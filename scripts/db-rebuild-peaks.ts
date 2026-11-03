// Rebuilds every game's best 7-day average from scratch under the current
// rules (full windows of 5+ days, complete days only). Run after changing them.
//
//   pnpm tsx --env-file-if-exists=.env.local scripts/db-rebuild-peaks.ts [--pglite dir]

import { applyMigrations } from "../lib/db/migrate";
import { refreshPeaks } from "../lib/db/ingest";
import { openDb } from "./_db";

async function main() {
  const { db, label } = await openDb();
  try {
    const applied = await applyMigrations(db);
    if (applied.length) console.log(`[peaks] applied migrations: ${applied.join(", ")}`);
    const [r] = await db.query<{ first: string; last: string }>("select min(day)::text as first, max(day)::text as last from game_daily");
    // max(day) is today and still partial, so it is the exclusive end.
    const n = await refreshPeaks(db, r.first, r.last, { replace: true });
    const [c] = await db.query<{ full: number; provisional: number }>(
      "select count(*) filter (where peak7_full)::int as full, count(*) filter (where not peak7_full)::int as provisional from game_peaks",
    );
    console.log(`[peaks] ${label}: rebuilt ${n} peaks from ${r.first} to ${r.last}; ${c.full} full, ${c.provisional} provisional`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("[peaks] failed:", err);
  process.exit(1);
});
