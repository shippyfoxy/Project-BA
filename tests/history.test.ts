import { describe, expect, it } from "vitest";
import { periodStart, rollUp, toCsv, toDaily, type DayRow } from "@/lib/trends/history";

const row = (day: string, avg: number, visits: number, rank: number | null = null, extra: Partial<DayRow> = {}): DayRow => ({
  day,
  playing_avg: avg,
  playing_min: avg - 10,
  playing_max: avg + 10,
  playing_max_at: `${day}T12:00:00Z`,
  visits,
  favorites: 5,
  up_votes: 9,
  down_votes: 1,
  samples: 5,
  top_earning_rank: rank,
  ...extra,
});

describe("history roll-ups", () => {
  it("starts weeks on Monday and months on the 1st", () => {
    expect(periodStart("2026-11-01", "weekly")).toBe("2026-10-26"); // a Sunday
    expect(periodStart("2026-11-02", "weekly")).toBe("2026-11-02"); // a Monday
    expect(periodStart("2026-11-19", "monthly")).toBe("2026-11-01");
  });

  it("measures new visits only across consecutive days and drops the lead-in day", () => {
    const d = toDaily([
      row("2026-10-31", 100, 1_000, null, { in_range: false }),
      row("2026-11-01", 100, 1_500),
      row("2026-11-03", 100, 2_500, 100),
    ]);
    expect(d.map((x) => x.day)).toEqual(["2026-11-01", "2026-11-03"]);
    expect(d[0].new_visits).toBe(500);
    expect(d[1].new_visits).toBeNull(); // 2 Nov is missing
    expect(d[1].est_monthly_devex_usd).toBe(110_000);
  });

  it("rolls weeks up with means, extremes, sums and ranked-day revenue", () => {
    const [w] = rollUp(
      [row("2026-11-02", 100, 1_000, 100), row("2026-11-03", 300, 1_400, null, { playing_max: 999 }), row("2026-11-04", 200, 2_000, 50)],
      "weekly",
    );
    expect(w).toMatchObject({ period_start: "2026-11-02", period_end: "2026-11-04", days: 3, playing_avg: 200, playing_max: 999, visits: 2_000 });
    expect(w.new_visits).toBe(1_000);
    expect(w.ranked_days).toBe(2);
    expect(w.best_top_earning_rank).toBe(50);
    expect(w.est_monthly_devex_usd).toBe(Math.round(((13_260_000 * 100 ** -1.041 + 13_260_000 * 50 ** -1.041) / 2) / 1_000) * 1_000);
  });

  it("quotes CSV cells that need it", () => {
    expect(toCsv([{ a: 'x, "y"', b: null }], ["a", "b"])).toBe('a,b\n"x, ""y""",\n');
  });
});
