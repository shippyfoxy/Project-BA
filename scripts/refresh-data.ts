// Generates data/snapshots/latest.json from live Roblox endpoints.
// Run via `pnpm refresh-data`. Reuses the previous snapshot to preserve the
// rolling `samples` array per game, which feeds the session-length proxy.

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getExploreSorts,
  getGames,
  getVotes,
} from "../lib/roblox/client";
import type { Snapshot, SnapshotGame, SnapshotSample } from "../lib/snapshot/schema";

const SNAPSHOT_PATH = path.resolve(process.cwd(), "data/snapshots/latest.json");
const MAX_SAMPLES_PER_GAME = 12; // ~12 hours of history at hourly refresh

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

  const sorts = await getExploreSorts(sessionId);
  const seedIds = dedupeIds(
    (sorts.sorts ?? [])
      .filter((s) => s.contentType === "Games")
      .flatMap((s) => (s.games ?? []).map((g) => g.universeId)),
  );
  console.log(`[refresh] seeded ${seedIds.length} universeIds from explore-api`);

  if (seedIds.length === 0) {
    throw new Error("explore-api returned no games — refusing to overwrite snapshot");
  }

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
