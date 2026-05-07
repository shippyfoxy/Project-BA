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

  it("computes the spec formula: like-ratio * log10(favs+1) * playing / max(visits/24, 1)", () => {
    // upVotes=900, downVotes=100 -> like-ratio=0.9
    // favoritedCount=999 -> log10(1000)=3
    // playing=240, visits=24*1000 -> visits/24 = 1000 -> playing/visits-rate = 0.24
    // expected = 0.9 * 3 * 0.24 = 0.648
    const v = retentionProxy({
      upVotes: 900,
      downVotes: 100,
      favoritedCount: 999,
      playing: 240,
      visits: 24_000,
    });
    expect(v).toBeCloseTo(0.648, 4);
  });

  it("uses the visits/24 floor of 1 to avoid blowing up tiny games", () => {
    // visits=12 -> visits/24 = 0.5 -> floored to 1, so denom is 1
    // upVotes=10,downVotes=0 -> 1.0 ; favs=9 -> log10(10)=1 ; playing=2
    // expected = 1.0 * 1 * 2 / 1 = 2
    expect(
      retentionProxy({
        upVotes: 10,
        downVotes: 0,
        favoritedCount: 9,
        playing: 2,
        visits: 12,
      }),
    ).toBeCloseTo(2, 4);
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
