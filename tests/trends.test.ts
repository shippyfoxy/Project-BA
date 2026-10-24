import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { connectPglite } from "@/lib/db/pglite";
import { applyMigrations } from "@/lib/db/migrate";
import { recordSnapshot } from "@/lib/db/live";
import type { IngestGame } from "@/lib/db/ingest";
import { getActiveGames, getTrendsHome } from "@/lib/trends/home";
import { getGameHistory, loadWeekAggregates } from "@/lib/trends/game";

const DAY = 86_400_000;
const START = Date.parse("2026-06-01T12:00:00Z");

// 21 days of one refresh a day for three games: one growing fast, one fading,
// one steady. Recorded through the same path the live refresh uses.
function gamesOn(d: number): IngestGame[] {
  const base = { creatorName: "Studio", genreL1: "Simulation", created: "2025-01-01T00:00:00Z", favoritedCount: 5_000, upVotes: 900, downVotes: 100 };
  return [
    { ...base, universeId: 1, rootPlaceId: 11, name: "Rocket", playing: 2_000 * 1.2 ** d, visits: 1_000_000 + d * 50_000 },
    { ...base, universeId: 2, rootPlaceId: 22, name: "Sunset", playing: Math.max(100, 60_000 - d * 2_800), visits: 5_000_000 + d * 20_000 },
    { ...base, universeId: 3, rootPlaceId: 33, name: "Plateau", genreL1: "Action", playing: 8_000, visits: 2_000_000 + d * 30_000 },
  ];
}

let db: Db;

beforeAll(async () => {
  db = await connectPglite();
  await applyMigrations(db);
  for (let d = 0; d < 21; d++) {
    const ts = START + d * DAY;
    await recordSnapshot(db, { generatedAt: new Date(ts).toISOString(), generatedAtMs: ts, games: gamesOn(d) }, ts);
  }
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("trends queries", () => {
  it("classifies active games from the last two weeks and game_peaks", async () => {
    const a = await getActiveGames(db);
    expect(a?.day).toBe("2026-06-21");
    const byName = Object.fromEntries(a!.games.map((g) => [g.name, g]));
    expect(byName.Rocket.stage).toBe("rising");
    expect(byName.Sunset.stage).toBe("fading");
    expect(byName.Plateau.cur7).toBeCloseTo(8_000);
    expect(byName.Plateau.daysTracked).toBe(21);
    expect(byName.Sunset.peak7).toBeGreaterThan(byName.Sunset.cur7 * 2);
  });

  it("builds the whole home page bundle", async () => {
    const h = await getTrendsHome(db);
    expect(h?.top[0].name).toBe("Rocket");
    expect(h?.stageCounts.rising).toBeGreaterThanOrEqual(1);
    expect(h?.rhythm.length).toBe(7);
    expect(h?.records.biggestReading?.name).toBe("Rocket");
  });

  it("loads the shared week aggregates with peaks and session estimates", async () => {
    const rows = await loadWeekAggregates(db, "2026-06-21");
    expect(rows).toHaveLength(3);
    const plateau = rows.find((r) => r.universe_id === 3)!;
    expect(plateau.genre).toBe("Action");
    expect(plateau.days_tracked).toBe(21);
    // 8,000 players and 30,000 new visits a day: 8,000 / (30,000 / 1,440) = 384 minutes.
    expect(plateau.session).toBeCloseTo(384, 0);
  });

  it("builds a full game history", async () => {
    const g = await getGameHistory(db, 2);
    expect(g?.name).toBe("Sunset");
    expect(g?.daily).toHaveLength(21);
    expect(g?.stage).toBe("fading");
    expect(g?.rank).toBe(2); // about 12,400 last week, ahead of Plateau at 8,000
    expect(await getGameHistory(db, 999)).toBeNull();
  });
});
