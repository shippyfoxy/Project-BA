import { describe, expect, it } from "vitest";
import { niceMax, quantile, shareBelow } from "@/lib/stats";

describe("quantile", () => {
  it("interpolates like percentile_cont", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.9)).toBe(10);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe("shareBelow", () => {
  it("counts values strictly below", () => {
    expect(shareBelow([1, 2, 3, 4], 3)).toBe(0.5);
    expect(shareBelow([1, 2, 3, 4], 10)).toBe(1);
    expect(shareBelow([1, 2, 3, 4], 1)).toBe(0);
  });
});

describe("niceMax", () => {
  it.each([
    [3_058_880, 4_000_000, 1_000_000],
    [1_960_746, 2_000_000, 500_000],
    [94, 100, 20],
    [7, 8, 2],
    [341_000_000, 400_000_000, 100_000_000],
  ])("%d -> max %d, step %d", (v, max, step) => {
    expect(niceMax(v)).toEqual({ max, step });
  });

  it("never has more than five steps and always covers the value", () => {
    for (const v of [1, 3, 9.9, 12, 47, 101, 999, 25_001, 7_777_777]) {
      const { max, step } = niceMax(v);
      expect(max).toBeGreaterThanOrEqual(v);
      expect(max / step).toBeLessThanOrEqual(5);
    }
  });
});
