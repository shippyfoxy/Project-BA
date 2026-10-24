import { describe, expect, it } from "vitest";
import { fmtCompact, fmtPct } from "@/lib/format";

describe("fmtCompact", () => {
  it.each([
    [9_707_687, 2, "9.71M"],
    [1_960_746, 2, "1.96M"],
    [2_000_000, 2, "2M"],
    [2_615, 2, "2.62k"],
    [2_615, 1, "2.6k"],
    [31_690_546_313, 1, "31.7B"],
    [999_999, 2, "1M"],
    [999.6, 2, "1k"],
    [950, 2, "950"],
    [0, 2, "0"],
    [-1_500, 2, "-1.5k"],
  ])("%d with %d digits -> %s", (n, d, out) => {
    expect(fmtCompact(n, d)).toBe(out);
  });

  it("never returns Intl's locale-specific suffixes", () => {
    for (const n of [1e3, 1e6, 1e9, 5.5e9]) expect(fmtCompact(n)).toMatch(/^[\d.]+[kMB]$/);
  });
});

describe("fmtPct", () => {
  it("signs with a true minus", () => {
    expect(fmtPct(641.2)).toBe("+641%");
    expect(fmtPct(-92)).toBe("−92%");
    expect(fmtPct(0.2)).toBe("0%");
  });
});
