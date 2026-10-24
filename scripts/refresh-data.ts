// Generates data/snapshots/latest.json from live Roblox endpoints.
// Run via `pnpm refresh-data`. Games come from Roblox's discovery lists plus,
// when a database is configured, every game already recorded there, so games
// stay tracked after they drop out of discovery. Reuses the previous snapshot
// to preserve the rolling `samples` array per game.
//
//   pnpm refresh-data                     # discovery + all known games
//   pnpm refresh-data --known-limit 300   # cap known games (local testing)

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getExpandedSeed,
  getGames,
  getVotes,
  type SeedVariant,
} from "../lib/roblox/client";
import { connectPostgres } from "../lib/db/postgres";
import type { Snapshot, SnapshotGame, SnapshotSample } from "../lib/snapshot/schema";

const SNAPSHOT_PATH = path.resolve(process.cwd(), "data/snapshots/latest.json");
const MAX_SAMPLES_PER_GAME = 48; // 24 h of history at 30-min refresh

// Fan-out across country + device variants to widen the seed pool to ~1000
// unique games. Each variant is a single explore-api call; all calls run
// sequentially through the shared 500ms TokenBucket, so no separate rate
// concern. On GitHub Actions every run gets a fresh public IP, so the burst
// lockout that triggered the local cooldown (see below) doesn't apply there.
const SEED_VARIANTS: SeedVariant[] = [
  // US baseline + all device classes
  {},
  { device: "high_end_phone" },
  { device: "low_end_phone" },
  { device: "high_end_tablet" },
  { device: "console" },
  // Major non-US markets (desktop/default device)
  { country: "gb" },
  { country: "br" },
  { country: "jp" },
  { country: "kr" },
  { country: "de" },
  { country: "ru" },
  { country: "ph" },
  { country: "in" },
  { country: "mx" },
  { country: "id" },
  { country: "tr" },
  // Cross-device variants for high-mobile regions — surface phone-first titles
  // that don't appear in the desktop or US slices
  { country: "br", device: "high_end_phone" },
  { country: "ph", device: "high_end_phone" },
  { country: "in", device: "low_end_phone" },
  { country: "id", device: "low_end_phone" },
];

async function readPreviousSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

// Every game the database knows about, most recently seen first.
async function loadKnownIds(limit: number): Promise<number[]> {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.log("[refresh] no database configured; tracking discovery games only");
    return [];
  }
  const db = connectPostgres(url);
  try {
    const rows = await db.query<{ id: number }>(
      "select universe_id::float8 as id from games order by last_seen desc limit $1",
      [Number.isFinite(limit) ? limit : null],
    );
    return rows.map((r) => r.id);
  } finally {
    await db.close();
  }
}

function argNumber(name: string): number {
  const i = process.argv.indexOf(name);
  const n = i === -1 ? NaN : Number(process.argv[i + 1]);
  return Number.isFinite(n) && n >= 0 ? n : Infinity;
}

function dedupeIds(input: number[]): number[] {
  return [...new Set(input.filter((n) => Number.isInteger(n) && n > 0))];
}

async function main() {
  const t0 = Date.now();
  const sessionId = randomUUID();
  console.log(`[refresh] sessionId=${sessionId}`);

  const { hits, perVariant } = await getExpandedSeed(sessionId, SEED_VARIANTS);
  const seedIds = dedupeIds([...hits.keys()]);
  for (const v of perVariant) {
    const label = `country=${v.variant.country ?? "us"} device=${v.variant.device ?? "computer"}`;
    console.log(`[refresh]   ${label}: ${v.total} games (+${v.added} new)`);
  }
  console.log(
    `[refresh] seeded ${seedIds.length} unique universeIds across ${SEED_VARIANTS.length} variants`,
  );

  if (seedIds.length === 0) {
    throw new Error("explore-api returned no games — refusing to overwrite snapshot");
  }

  const knownIds = await loadKnownIds(argNumber("--known-limit"));
  const allIds = dedupeIds([...seedIds, ...knownIds]);
  console.log(
    `[refresh] tracking ${allIds.length} games: ${seedIds.length} in discovery today, ` +
      `${allIds.length - seedIds.length} more already known (${knownIds.length} known in total)`,
  );

  // Brief pause between seed phase and enrichment phase. On GitHub Actions
  // (fresh IP per run) this isn't strictly needed, but a small buffer guards
  // against any sliding-window overlap at the host level.
  const COOLDOWN_MS = 3_000;
  console.log(`[refresh] cooling down ${COOLDOWN_MS / 1000}s before enrichment`);
  await new Promise((r) => setTimeout(r, COOLDOWN_MS));

  const [games, votes] = await Promise.all([
    getGames(allIds),
    getVotes(allIds),
  ]);
  console.log(
    `[refresh] enriched: ${games.length} games, ${votes.length} vote records`,
  );

  // Deleted or moderated games still come back, as placeholders with id 0 and
  // "[TITLE UNAVAILABLE]". Polling every known game makes these routine.
  const available = games.filter((g) => Number.isInteger(g.id) && g.id > 0);
  if (available.length < games.length) {
    console.log(`[refresh] dropped ${games.length - available.length} unavailable games`);
  }

  const voteMap = new Map(votes.map((v) => [v.id, v]));
  const previous = await readPreviousSnapshot();
  const prevMap = new Map(
    (previous?.games ?? []).map((g) => [g.universeId, g]),
  );

  const ts = Date.now();
  const merged: SnapshotGame[] = available.map((g) => {
    const v = voteMap.get(g.id);
    const hit = hits.get(g.id);
    const sample: SnapshotSample = { ts, playing: g.playing, visits: g.visits };
    const prevSamples = prevMap.get(g.id)?.samples ?? [];
    const samples = [...prevSamples, sample].slice(-MAX_SAMPLES_PER_GAME);
    return {
      universeId: g.id,
      rootPlaceId: g.rootPlaceId,
      name: g.name,
      creatorName: g.creator?.name ?? "Unknown",
      genreL1: g.genre_l1 || g.genre || "Other",
      genreL2: g.genre_l2 || "",
      visits: g.visits,
      favoritedCount: g.favoritedCount,
      upVotes: v?.upVotes ?? 0,
      downVotes: v?.downVotes ?? 0,
      playing: g.playing,
      created: g.created,
      updated: g.updated,
      canonicalUrlPath: g.canonicalUrlPath,
      minimumAge: hit?.minimumAge ?? null,
      ageRecommendation: hit?.ageRecommendation ?? null,
      popularInCountries: hit ? [...hit.countries].sort() : [],
      popularOnDevices: hit ? [...hit.devices].sort() : [],
      samples,
    };
  });

  const snapshot: Snapshot = {
    generatedAt: new Date(ts).toISOString(),
    generatedAtMs: ts,
    source: "explore-api+games-api",
    games: merged,
  };

  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  // Compact: with every known game the snapshot is tens of megabytes.
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[refresh] wrote ${merged.length} games to ${path.relative(process.cwd(), SNAPSHOT_PATH)} in ${elapsed}s`,
  );
}

main().catch((err) => {
  console.error("[refresh] failed:", err);
  process.exit(1);
});
