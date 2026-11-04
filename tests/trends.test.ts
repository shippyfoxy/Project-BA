import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { connectPglite } from "@/lib/db/pglite";
import { applyMigrations } from "@/lib/db/migrate";
import { recordSnapshot } from "@/lib/db/live";
import type { IngestGame } from "@/lib/db/ingest";
import { getActiveGames, getTrendsHome } from "@/lib/trends/home";
import { getGameHistory, loadWeekAggregates } from "@/lib/trends/game";
import { DEFAULT_FILTERS, filtersToQuery, parseFilters, screenGames } from "@/lib/trends/screener";
import { genreBenchmarks, getGenreTrends } from "@/lib/trends/genreTrends";
import { daysSince, getCompareGames, parseIds } from "@/lib/trends/compare";
import { getEarningRanks } from "@/lib/trends/earnings";
import { estMonthlyDevEx, fmtUsdEstimate } from "@/lib/trends/revenue";

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
    // Weeks end on the last complete day; the 21st is still in progress.
    expect(a?.day).toBe("2026-06-20");
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

  it("screens games by launch window, players, genre and stage", async () => {
    // Every test game was created in 2025, so the default 30-day window is empty.
    expect((await screenGames(db, DEFAULT_FILTERS))?.matches).toHaveLength(0);
    const any = { ...DEFAULT_FILTERS, launched: "any" as const };
    const all = await screenGames(db, any);
    expect(all?.matches.map((g) => g.name)).toEqual(["Rocket", "Sunset", "Plateau"]);
    expect(all?.genreCounts).toEqual([["Simulation", 2], ["Action", 1]]);
    const action = await screenGames(db, { ...any, genres: ["Action"] });
    expect(action?.matches.map((g) => g.name)).toEqual(["Plateau"]);
    expect(action?.stageCounts.peaking).toBe(1);
    // Genre counts ignore the genre filter itself.
    expect(action?.genreCounts).toEqual([["Simulation", 2], ["Action", 1]]);
    const fading = await screenGames(db, { ...any, stages: ["fading"] });
    expect(fading?.matches.map((g) => g.name)).toEqual(["Sunset"]);
    expect((await screenGames(db, { ...any, min: 10_000 }))?.matches.map((g) => g.name)).toEqual(["Rocket", "Sunset"]);
    expect((await screenGames(db, { ...any, q: "plat" }))?.matches).toHaveLength(1);
    expect((await screenGames(db, { ...any, order: "asc" }))?.matches.map((g) => g.name)).toEqual(["Plateau", "Sunset", "Rocket"]);
    const plateau = all!.matches.find((g) => g.name === "Plateau")!;
    expect(plateau.session).toBeCloseTo(384, 0);
    expect(plateau.favsPer1k).toBeCloseTo((1_000 * 5_000) / (2_000_000 + 19 * 30_000), 3);
  });
});

describe("genre trends and compare", () => {
  it("splits players by genre over 7-day windows ending on the latest day", async () => {
    const t = await getGenreTrends(db);
    expect(t?.latestDay).toBe("2026-06-20");
    const sim = t!.shares.find((g) => g.genre === "Simulation")!;
    const act = t!.shares.find((g) => g.genre === "Action")!;
    expect(sim.share + act.share).toBeCloseTo(1, 6);
    expect(sim.games).toBe(2);
    // The latest window's share is the last weekly point, so the headline and the chart agree.
    expect(sim.weeks[sim.weeks.length - 1].share).toBeCloseTo(sim.share, 9);
    expect(t!.concentration.weeks.at(-1)!.top10).toBeCloseTo(1, 6);
    expect(t!.concentration.weeks.at(-1)!.topName).toBe("Rocket");
  });

  it("benchmarks genres from the week aggregates", async () => {
    const { all, genres } = genreBenchmarks(await loadWeekAggregates(db, "2026-06-21"), 1);
    expect(all.n).toBe(3);
    expect(genres.map((g) => [g.genre, g.n])).toEqual([
      ["Simulation", 2],
      ["Action", 1],
    ]);
    expect(all.p99).toBeNull();
  });

  it("lines up launch curves with peaks", async () => {
    expect(parseIds("3,abc,1,3,2,9,8")).toEqual([3, 1, 2, 9]);
    const [sunset] = await getCompareGames(db, [2]);
    expect(sunset.points).toHaveLength(20); // complete days only
    expect(sunset.peak.r7).toBeGreaterThan(sunset.latest.r7);
    expect(daysSince(Date.parse("2026-06-01T23:00:00Z"), Date.parse("2026-06-03"))).toBe(2);
  });
});

describe("top earning ranks and revenue estimates", () => {
  it("records ranks by day, keeping the latest reading", async () => {
    const day = Date.parse("2026-06-21T18:00:00Z");
    await recordSnapshot(db, { generatedAt: new Date(day).toISOString(), generatedAtMs: day, games: gamesOn(20), topEarning: [
      { universeId: 3, rank: 1 },
      { universeId: 1, rank: 2 },
      { universeId: 999, rank: 3 }, // unknown game: skipped, not an error
    ] }, day);
    const later = day + 3_600_000;
    await recordSnapshot(db, { generatedAt: new Date(later).toISOString(), generatedAtMs: later, games: gamesOn(20), topEarning: [
      { universeId: 1, rank: 1 },
      { universeId: 3, rank: 2 },
    ] }, later);
    const rows = await db.query<{ universe_id: number; rank: number }>(`select universe_id::float8 as universe_id, rank from earning_ranks order by rank`);
    expect(rows).toEqual([{ universe_id: 1, rank: 1 }, { universe_id: 3, rank: 2 }]);

    const rocket = await getEarningRanks(db, 1);
    expect(rocket.latest?.rank).toBe(1);
    expect((await getEarningRanks(db, 2)).latest).toBeNull();
  });

  it("screens and sorts by estimated revenue", async () => {
    const any = { ...DEFAULT_FILTERS, launched: "any" as const };
    const ranked = await screenGames(db, { ...any, earning: true });
    expect(ranked?.matches.map((g) => g.name)).toEqual(["Rocket", "Plateau"]);
    const byEarnings = await screenGames(db, { ...any, sort: "earnings" });
    expect(byEarnings?.matches.map((g) => g.name)).toEqual(["Rocket", "Plateau", "Sunset"]);
    expect(byEarnings?.matches[0].estMonthly).toBeCloseTo(13_260_000, -3);
    expect(parseFilters({ earning: "1", sort: "earnings" })).toMatchObject({ earning: true, sort: "earnings" });
  });

  it("models payouts from rank", () => {
    expect(estMonthlyDevEx(null)).toBeNull();
    const r100 = estMonthlyDevEx(100)!;
    expect(r100.mid).toBeGreaterThan(105_000);
    expect(r100.mid).toBeLessThan(115_000);
    expect(r100.low).toBeCloseTo(estMonthlyDevEx(101)!.mid * 0.7);
    expect(r100.high).toBeCloseTo(estMonthlyDevEx(99)!.mid * 1.5);
    expect(fmtUsdEstimate(r100.mid)).toBe("$110k");
    expect(fmtUsdEstimate(1_234_567)).toBe("$1.2M");
    expect(fmtUsdEstimate(996_000)).toBe("$1M");
    expect(fmtUsdEstimate(13_260_000)).toBe("$13M");
    expect(fmtUsdEstimate(9_282_000)).toBe("$9.3M");
    expect(fmtUsdEstimate(46_480)).toBe("$46k");
  });

  it("gives neighbours at the top overlapping ranges", () => {
    const [r1, r2] = [estMonthlyDevEx(1)!, estMonthlyDevEx(2)!];
    expect(r1.low).toBeLessThan(r2.high);
    expect(r2.high).toBeCloseTo(r1.mid * 1.5);
    // An effective rank between two places lands between their estimates.
    expect(estMonthlyDevEx(1.5)!.mid).toBeLessThan(r1.mid);
    expect(estMonthlyDevEx(1.5)!.mid).toBeGreaterThan(r2.mid);
  });
});

describe("publishes and titles", () => {
  it("records each publish once and each title change with when the old title was last seen", async () => {
    const t1 = Date.parse("2026-06-22T10:00:00Z");
    const t2 = t1 + 3_600_000;
    const withUpdate = (ts: number, name: string) =>
      gamesOn(21).map((g) => (g.universeId === 3 ? { ...g, name, updated: "2026-06-22T09:30:00Z" } : g));
    await recordSnapshot(db, { generatedAt: new Date(t1).toISOString(), generatedAtMs: t1, games: withUpdate(t1, "Plateau") }, t1);
    await recordSnapshot(db, { generatedAt: new Date(t2).toISOString(), generatedAtMs: t2, games: withUpdate(t2, "[UPD 2] Plateau") }, t2);
    const updates = await db.query<{ n: number }>(`select count(*)::int as n from game_updates where universe_id = 3`);
    expect(updates[0].n).toBe(1);
    const names = await db.query<{ name: string; prev_ms: number | null }>(
      `select name, extract(epoch from prev_seen)::float8 * 1000 as prev_ms from game_names where universe_id = 3 order by first_seen`,
    );
    expect(names.map((n) => n.name)).toEqual(["Plateau", "[UPD 2] Plateau"]);
    expect(names[1].prev_ms).toBe(t1);
  });
});

describe("explore filters", () => {
  it("parses and round-trips query strings", () => {
    expect(parseFilters({})).toEqual(DEFAULT_FILTERS);
    const f = parseFilters({ launched: "60", min: "10000", genre: ["Action", "Action", "RPG"], stage: ["rising", "bogus"], sort: "wow", country: "zz" });
    expect(f).toMatchObject({ launched: "60", min: 10_000, genres: ["Action", "RPG"], stages: ["rising"], sort: "wow", country: null });
    expect(parseFilters(Object.fromEntries(new URLSearchParams(filtersToQuery(f)).entries()))).toMatchObject({ launched: "60", sort: "wow" });
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe("");
    expect(parseFilters({ min: "123", n: "99999" })).toMatchObject({ min: 0, limit: 500 });
  });

  it("searches across every launch date unless a window is picked", () => {
    expect(parseFilters({ q: "egg" }).launched).toBe("any");
    expect(parseFilters({ q: "egg", launched: "30" }).launched).toBe("30");
    expect(filtersToQuery(parseFilters({ q: "egg" }))).toBe("?q=egg");
  });
});
