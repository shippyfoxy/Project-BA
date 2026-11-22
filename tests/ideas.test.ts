import { describe, expect, it } from "vitest";
import { buildGenres, buildPatterns, momentumOf, nameTerms, type IdeaGame } from "@/lib/trends/ideas";

const game = (id: number, name: string, cur7: number, prev7: number | null = cur7): IdeaGame => ({
  universeId: id,
  name,
  genre: "Simulation",
  subgenre: null,
  cur7,
  prev7,
  launched: false,
  launchedBefore: false,
  effRank: null,
});

describe("game ideas", () => {
  it("reads words and pairs from a name without tags or emoji", () => {
    const terms = nameTerms("[🎃] +1 Speed Every Second 🏃");
    expect(terms).toContain("+1");
    expect(terms).toContain("+1 speed");
    expect(terms).toContain("speed");
    expect(terms).not.toContain("🎃");
    expect(nameTerms("Steal a Brainrot")).toContain("steal a");
    expect(nameTerms("The Game 2")).toEqual([]);
  });

  it("judges momentum against the market", () => {
    expect(momentumOf(0.15, 0, 0)).toBe("rising");
    expect(momentumOf(-0.2, 0, 0)).toBe("fading");
    expect(momentumOf(0, 20, 10)).toBe("crowding");
    expect(momentumOf(0, 4, 1)).toBe("steady");
    // When every group doubles its new games (a wider net), doubling is not a rush.
    expect(momentumOf(0, 20, 10, 2)).toBe("steady");
    expect(momentumOf(0, 40, 10, 2)).toBe("crowding");
  });

  it("keeps one row for patterns that are really the same games", () => {
    const games = [
      game(1, "Murder Mystery 2", 400_000),
      ...[2, 3, 4, 5, 6].map((i) => game(i, `Murder Mystery Duels ${i}`, 500)),
      ...[7, 8, 9, 10, 11, 12].map((i) => game(i, `Tower Defense ${i}`, 1_000)),
    ];
    const terms = buildPatterns(games, 0).map((p) => p.term);
    expect(terms).toContain("murder mystery");
    expect(terms).not.toContain("murder");
    expect(terms).not.toContain("mystery");
    expect(terms).toContain("tower defense");
  });

  it("groups subgenres, skipping games without one, under their usual genre", () => {
    const games = [
      ...Array.from({ length: 10 }, (_, i) => ({ ...game(i + 1, `Tycoon ${i}`, 1_000), subgenre: "Tycoon" })),
      { ...game(20, "Odd one", 1_000), genre: "Action", subgenre: "Tycoon" },
      ...Array.from({ length: 12 }, (_, i) => game(30 + i, `Plain ${i}`, 1_000)),
    ];
    const subs = buildGenres(games, 0, true);
    expect(subs.map((s) => [s.genre, s.parent, s.games])).toEqual([["Tycoon", "Simulation", 11]]);
  });
});
