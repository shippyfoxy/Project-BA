import { describe, it, expect } from "vitest";
import {
  retentionProxy,
  estimatedSessionMinutes,
  sessionBucket,
  likeRatio,
} from "@/lib/metrics";

describe("likeRatio", () => {
  it("returns up/(up+down) for non-zero totals", () => {
    expect(likeRatio(80, 20)).toBeCloseTo(0.8);
    expect(likeRatio(1, 1)).toBeCloseTo(0.5);
  });

  it("returns 0 when both votes are zero (no signal)", () => {
    expect(likeRatio(0, 0)).toBe(0);
  });

  it("clamps negative inputs to 0", () => {
    expect(likeRatio(-5, 5)).toBe(0);
    expect(likeRatio(5, -5)).toBe(0);
  });
});

describe("retentionProxy", () => {
  it("returns 0 when there are no votes", () => {
    expect(
      retentionProxy({
        upVotes: 0,
        downVotes: 0,
        favoritedCount: 1000,
        playing: 100,
        visits: 1_000_000,
      }),
    ).toBe(0);
  });

  it("returns 0 when no players are currently playing", () => {
    expect(
      retentionProxy({
        upVotes: 100,
        downVotes: 10,
        favoritedCount: 1000,
        playing: 0,
        visits: 1_000_000,
      }),
    ).toBe(0);
  });

  it("returns 0 when favourites are zero (log10(1) = 0)", () => {
    expect(
      retentionProxy({
        upVotes: 100,
        downVotes: 0,
        favoritedCount: 0,
        playing: 50,
        visits: 1000,
      }),
    ).toBe(0);
  });

  it("computes the v2 formula: like-ratio * log10(favs+1) * log10(playing+1)", () => {
    // upVotes=900, downVotes=100 -> like-ratio=0.9
    // favs=999 -> log10(1000)=3
    // playing=999 -> log10(1000)=3
    // expected = 0.9 * 3 * 3 = 8.1
    const v = retentionProxy({
      upVotes: 900,
      downVotes: 100,
      favoritedCount: 999,
      playing: 999,
      visits: 24_000,
    });
    expect(v).toBeCloseTo(8.1, 4);
  });

  it("does not penalise high lifetime visits (was a v1 bug)", () => {
    // Brookhaven-shaped: huge visits, huge favs, huge playing, near-perfect ratio.
    // v1 collapsed this to ~0; v2 should rank it near the top of the score range.
    const brookhaven = retentionProxy({
      upVotes: 970_000,
      downVotes: 30_000,
      favoritedCount: 73_000_000,
      playing: 620_000,
      visits: 82_000_000_000,
    });
    // Tiny new game with similar quality but no scale.
    const newGame = retentionProxy({
      upVotes: 95,
      downVotes: 5,
      favoritedCount: 100,
      playing: 10,
      visits: 1_000,
    });
    expect(brookhaven).toBeGreaterThan(newGame);
    expect(brookhaven).toBeGreaterThan(40); // ≈ 0.97 × 7.86 × 5.79
  });

  it("returns 0 (not NaN/Infinity) on malformed input", () => {
    expect(
      retentionProxy({
        upVotes: NaN,
        downVotes: 0,
        favoritedCount: 0,
        playing: 0,
        visits: 0,
      }),
    ).toBe(0);
  });
});

describe("estimatedSessionMinutes", () => {
  const earlierTs = new Date("2026-05-06T12:00:00Z").getTime();
  const laterTs = new Date("2026-05-06T12:30:00Z").getTime();

  it("computes playing / (newVisits / intervalMinutes) using later.playing", () => {
    // 30-minute interval, 600 new visits -> 20 visits/min
    // later.playing = 200 -> session = 200 / 20 = 10 minutes
    const m = estimatedSessionMinutes({
      earlier: { ts: earlierTs, playing: 180, visits: 1_000_000 },
      later: { ts: laterTs, playing: 200, visits: 1_000_600 },
    });
    expect(m).toBeCloseTo(10, 5);
  });

  it("returns null when no new visits accumulated in the window", () => {
    const m = estimatedSessionMinutes({
      earlier: { ts: earlierTs, playing: 180, visits: 1_000_000 },
      later: { ts: laterTs, playing: 200, visits: 1_000_000 },
    });
    expect(m).toBeNull();
  });

  it("returns null when the visit count went backwards (data glitch)", () => {
    const m = estimatedSessionMinutes({
      earlier: { ts: earlierTs, playing: 180, visits: 1_000_500 },
      later: { ts: laterTs, playing: 200, visits: 1_000_000 },
    });
    expect(m).toBeNull();
  });

  it("returns null when the interval is non-positive", () => {
    const m = estimatedSessionMinutes({
      earlier: { ts: laterTs, playing: 200, visits: 1_000_600 },
      later: { ts: earlierTs, playing: 180, visits: 1_000_000 },
    });
    expect(m).toBeNull();
  });

  it("returns null when later.playing is zero (no session signal)", () => {
    const m = estimatedSessionMinutes({
      earlier: { ts: earlierTs, playing: 0, visits: 1_000_000 },
      later: { ts: laterTs, playing: 0, visits: 1_000_600 },
    });
    expect(m).toBeNull();
  });
});

describe("sessionBucket", () => {
  it("maps minutes to <5m / 5-15m / 15-30m / 30m+ ranges", () => {
    expect(sessionBucket(2)).toBe("<5m");
    expect(sessionBucket(4.99)).toBe("<5m");
    expect(sessionBucket(5)).toBe("5-15m");
    expect(sessionBucket(14.99)).toBe("5-15m");
    expect(sessionBucket(15)).toBe("15-30m");
    expect(sessionBucket(29.99)).toBe("15-30m");
    expect(sessionBucket(30)).toBe("30m+");
    expect(sessionBucket(180)).toBe("30m+");
  });

  it("returns null for null input", () => {
    expect(sessionBucket(null)).toBeNull();
  });

  it("returns null for negative minutes", () => {
    expect(sessionBucket(-1)).toBeNull();
  });
});
