import { describe, it, expect } from "vitest";
import {
  regionBreakdown,
  retentionByGenreAndAge,
  topGamesByConcurrent,
  topGamesByRetention,
} from "@/lib/snapshot/aggregate";
import type { Snapshot, SnapshotGame } from "@/lib/snapshot/schema";

function game(overrides: Partial<SnapshotGame>): SnapshotGame {
  return {
    universeId: 1,
    rootPlaceId: 1,
    name: "Test Game",
    creatorName: "Creator",
    genreL1: "Adventure",
    genreL2: "",
    visits: 1_000,
    favoritedCount: 100,
    upVotes: 90,
    downVotes: 10,
    playing: 50,
    created: "2024-01-01T00:00:00Z",
    updated: "2024-06-01T00:00:00Z",
    canonicalUrlPath: "/games/1/test",
    minimumAge: null,
    ageRecommendation: null,
    popularInCountries: [],
    popularOnDevices: [],
    samples: [],
    ...overrides,
  };
}

function snapshot(games: SnapshotGame[]): Snapshot {
  return {
    generatedAt: "2026-05-09T00:00:00Z",
    generatedAtMs: Date.parse("2026-05-09T00:00:00Z"),
    source: "explore-api+games-api",
    games,
  };
}

describe("topGamesByConcurrent", () => {
  it("sorts by playing descending", () => {
    const rows = topGamesByConcurrent(
      snapshot([
        game({ universeId: 1, playing: 100 }),
        game({ universeId: 2, playing: 500 }),
        game({ universeId: 3, playing: 50 }),
      ]),
    );
    expect(rows.map((r) => r.universeId)).toEqual([2, 1, 3]);
  });

  it("respects the limit", () => {
    const rows = topGamesByConcurrent(
      snapshot([
        game({ universeId: 1, playing: 100 }),
        game({ universeId: 2, playing: 500 }),
        game({ universeId: 3, playing: 50 }),
      ]),
      2,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.playing)).toEqual([500, 100]);
  });

  it("includes lifetime visits in the output row", () => {
    const rows = topGamesByConcurrent(
      snapshot([game({ universeId: 1, playing: 100, visits: 1_234_567 })]),
    );
    expect(rows[0].visits).toBe(1_234_567);
  });

  it("returns an empty array on an empty snapshot", () => {
    expect(topGamesByConcurrent(snapshot([]))).toEqual([]);
  });
});

describe("topGamesByRetention", () => {
  it("sorts by retention proxy descending and pushes zero-proxy games last", () => {
    // Proxy = like-ratio × log10(favs+1) × playing / max(visits/24, 1)
    //   id=1: 0.9 × 3 × (240/1000) = 0.648
    //   id=2: 0 (no votes)
    //   id=3: 0.5 × 1 × (1/1000)   = 0.0005
    // Expected order: 1, 3, 2
    const rows = topGamesByRetention(
      snapshot([
        game({
          universeId: 1,
          upVotes: 900,
          downVotes: 100,
          favoritedCount: 999,
          playing: 240,
          visits: 24_000,
        }),
        game({
          universeId: 2,
          upVotes: 0,
          downVotes: 0,
          favoritedCount: 999,
          playing: 240,
          visits: 24_000,
        }),
        game({
          universeId: 3,
          upVotes: 50,
          downVotes: 50,
          favoritedCount: 9,
          playing: 1,
          visits: 24_000,
        }),
      ]),
    );
    expect(rows.map((r) => r.universeId)).toEqual([1, 3, 2]);
    // The zero-proxy game must rank last regardless of its raw popularity.
    expect(rows[rows.length - 1].universeId).toBe(2);
  });
});

describe("retentionByGenreAndAge", () => {
  function strongGame(i: number, genre: string, age: string): SnapshotGame {
    return game({
      universeId: i,
      genreL1: genre,
      ageRecommendation: age,
      upVotes: 900,
      downVotes: 100,
      favoritedCount: 999,
      playing: 240,
      visits: 24_000,
    });
  }
  function weakGame(i: number, genre: string, age: string): SnapshotGame {
    return game({
      universeId: i,
      genreL1: genre,
      ageRecommendation: age,
      upVotes: 50,
      downVotes: 50,
      favoritedCount: 9,
      playing: 1,
      visits: 24_000,
    });
  }

  it("ranks combos by adjusted retention with the larger-sample combo on top", () => {
    const games: SnapshotGame[] = [];
    // Survival / Minimal — 12 strong games
    for (let i = 1; i <= 12; i++) games.push(strongGame(i, "Survival", "Minimal"));
    // RPG / Mild — 11 weak games
    for (let i = 100; i <= 110; i++) games.push(weakGame(i, "RPG", "Mild"));

    const rows = retentionByGenreAndAge(snapshot(games));
    expect(rows[0].genre).toBe("Survival");
    expect(rows[0].adjustedRetentionProxy).toBeGreaterThan(rows[1].adjustedRetentionProxy);
  });

  it("shrinkage pulls a small-sample combo's adjusted score closer to the global mean than a large-sample combo's", () => {
    const games: SnapshotGame[] = [];
    // 10 strong games (smallest combo allowed by min)
    for (let i = 1; i <= 10; i++) games.push(strongGame(i, "RPG", "Minimal"));
    // 100 mediocre games (large combo)
    for (let i = 100; i < 200; i++) {
      games.push(
        game({
          universeId: i,
          genreL1: "Simulation",
          ageRecommendation: "Minimal",
          upVotes: 700,
          downVotes: 300,
          favoritedCount: 99,
          playing: 50,
          visits: 24_000,
        }),
      );
    }
    const rows = retentionByGenreAndAge(snapshot(games));
    const small = rows.find((r) => r.genre === "RPG")!;
    const large = rows.find((r) => r.genre === "Simulation")!;

    // The small combo's adjusted score should be pulled meaningfully off its raw
    // mean — the large combo's adjusted score should barely move. This is the
    // whole point of shrinkage: trust big samples, dampen small ones.
    const smallShrinkRatio =
      Math.abs(small.adjustedRetentionProxy - small.meanRetentionProxy) /
      small.meanRetentionProxy;
    const largeShrinkRatio =
      Math.abs(large.adjustedRetentionProxy - large.meanRetentionProxy) /
      Math.max(large.meanRetentionProxy, 1e-9);

    expect(smallShrinkRatio).toBeGreaterThan(largeShrinkRatio);
    expect(smallShrinkRatio).toBeGreaterThan(0.3); // ≥30% pulled
    expect(largeShrinkRatio).toBeLessThan(0.3);    // <30% pulled
  });

  it("filters out combos below the minimum game count to reduce noise", () => {
    const games = [1, 2].map((i) => strongGame(i, "Survival", "Minimal"));
    expect(retentionByGenreAndAge(snapshot(games))).toEqual([]);
  });

  it("excludes Roblox bookkeeping buckets like Education and Other", () => {
    const games: SnapshotGame[] = [];
    for (let i = 1; i <= 12; i++) games.push(strongGame(i, "Education", "Minimal"));
    for (let i = 100; i <= 112; i++) games.push(strongGame(i, "Other", "Minimal"));
    expect(retentionByGenreAndAge(snapshot(games))).toEqual([]);
  });

  it("computes shareOfPlayers as a fraction of all eligible games' players", () => {
    const games: SnapshotGame[] = [];
    for (let i = 1; i <= 10; i++) {
      games.push(game({ universeId: i, genreL1: "Survival", ageRecommendation: "Minimal", playing: 100 }));
    }
    for (let i = 100; i <= 109; i++) {
      games.push(game({ universeId: i, genreL1: "RPG", ageRecommendation: "Mild", playing: 300 }));
    }
    const rows = retentionByGenreAndAge(snapshot(games));
    const survival = rows.find((r) => r.genre === "Survival");
    const rpg = rows.find((r) => r.genre === "RPG");
    // Survival: 1000 players, RPG: 3000, total 4000
    expect(survival?.shareOfPlayers).toBeCloseTo(0.25, 2);
    expect(rpg?.shareOfPlayers).toBeCloseTo(0.75, 2);
  });
});

describe("regionBreakdown", () => {
  it("counts each game once per country it appeared in", () => {
    const rows = regionBreakdown(
      snapshot([
        // Game in 3 countries
        game({ universeId: 1, playing: 100, popularInCountries: ["us", "gb", "jp"] }),
        // Game in 1 country
        game({ universeId: 2, playing: 50, popularInCountries: ["us"] }),
        // Game with no country tag — should be excluded entirely
        game({ universeId: 3, playing: 999, popularInCountries: [] }),
      ]),
    );
    const us = rows.find((r) => r.country === "us");
    const gb = rows.find((r) => r.country === "gb");
    expect(us?.gameCount).toBe(2);
    expect(us?.totalPlaying).toBe(150);
    expect(gb?.gameCount).toBe(1);
    expect(rows.find((r) => r.country === "kr")).toBeUndefined();
  });

  it("ranks regions by total players descending", () => {
    const rows = regionBreakdown(
      snapshot([
        game({ universeId: 1, playing: 1000, popularInCountries: ["us"] }),
        game({ universeId: 2, playing: 100, popularInCountries: ["jp"] }),
        game({ universeId: 3, playing: 500, popularInCountries: ["gb"] }),
      ]),
    );
    expect(rows.map((r) => r.country)).toEqual(["us", "gb", "jp"]);
  });

  it("resolves the top genre per region by mode count", () => {
    const rows = regionBreakdown(
      snapshot([
        game({ universeId: 1, genreL1: "Survival", popularInCountries: ["us"] }),
        game({ universeId: 2, genreL1: "Survival", popularInCountries: ["us"] }),
        game({ universeId: 3, genreL1: "RPG", popularInCountries: ["us"] }),
      ]),
    );
    expect(rows[0].topGenre).toBe("Survival");
  });

  it("returns top games, genre mix, and age mix for the drill-down view", () => {
    const rows = regionBreakdown(
      snapshot([
        game({ universeId: 1, name: "Big Game", playing: 1_000, genreL1: "Survival", ageRecommendation: "Minimal", popularInCountries: ["us"] }),
        game({ universeId: 2, name: "Mid Game", playing: 500, genreL1: "Survival", ageRecommendation: "Minimal", popularInCountries: ["us"] }),
        game({ universeId: 3, name: "Small Game", playing: 100, genreL1: "RPG", ageRecommendation: "Mild", popularInCountries: ["us"] }),
      ]),
    );
    const us = rows.find((r) => r.country === "us")!;
    expect(us.topGames.map((g) => g.name)).toEqual(["Big Game", "Mid Game", "Small Game"]);
    expect(us.topGenres[0]).toMatchObject({ genre: "Survival", gameCount: 2 });
    expect(us.topGenres[0].sharePct).toBeCloseTo(66.67, 1);
    expect(us.ageMix.find((a) => a.ageRecommendation === "Minimal")?.gameCount).toBe(2);
    expect(us.ageMix.find((a) => a.ageRecommendation === "Mild")?.gameCount).toBe(1);
  });
});
