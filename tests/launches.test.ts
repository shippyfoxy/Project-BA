import { describe, expect, it } from "vitest";
import { QUANTILES, standing } from "@/lib/trends/launches";

// Players at each 5% step: 0 for the bottom 40%, then 100, 200, ... 1,100.
const q = QUANTILES.map((p, i) => (p <= 0.4 ? 0 : (i - 7) * 100));

describe("launch standing", () => {
  it("places a game between the 5% steps", () => {
    expect(standing(q, 100)).toBeCloseTo(0.45);
    expect(standing(q, 150)).toBeCloseTo(0.475);
  });

  it("caps at the top and gives no credit for zero players", () => {
    expect(standing(q, 5_000)).toBeCloseTo(0.95);
    expect(standing(q, 0)).toBe(0);
  });
});
