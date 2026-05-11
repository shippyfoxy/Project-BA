// Generates data/snapshots/latest.json from live Roblox endpoints.
// Run via `pnpm refresh-data`. Reuses the previous snapshot to preserve the
// rolling `samples` array per game, which feeds the session-length proxy.

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getExpandedSeed,
  getGames,
  getVotes,
  type SeedVariant,
} from "../lib/roblox/client";
import type { Snapshot, SnapshotGame, SnapshotSample } from "../lib/snapshot/schema";

const SNAPSHOT_PATH = path.resolve(process.cwd(), "data/snapshots/latest.json");
const MAX_SAMPLES_PER_GAME = 12; // ~12 hours of history at hourly refresh

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

  // Brief pause between seed phase and enrichment phase. On GitHub Actions
  // (fresh IP per run) this isn't strictly needed, but a small buffer guards
  // against any sliding-window overlap at the host level.
  const COOLDOWN_MS = 3_000;
  console.log(`[refresh] cooling down ${COOLDOWN_MS / 1000}s before enrichment`);
  await new Promise((r) => setTimeout(r, COOLDOWN_MS));

  const [games, votes] = await Promise.all([
    getGames(seedIds),
    getVotes(seedIds),
  ]);
  console.log(
    `[refresh] enriched: ${games.length} games, ${votes.length} vote records`,
  );

  const voteMap = new Map(votes.map((v) => [v.id, v]));
  const previous = await readPreviousSnapshot();
  const prevMap = new Map(
    (previous?.games ?? []).map((g) => [g.universeId, g]),
  );

  const ts = Date.now();
  const merged: SnapshotGame[] = games.map((g) => {
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
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[refresh] wrote ${merged.length} games to ${path.relative(process.cwd(), SNAPSHOT_PATH)} in ${elapsed}s`,
  );
}

main().catch((err) => {
  console.error("[refresh] failed:", err);
  process.exit(1);
});
