import { describe, expect, it } from "vitest";
import { lifecycleStage, type StageInput } from "@/lib/trends/stage";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-22T12:00:00Z");

function input(over: Partial<StageInput> = {}): StageInput {
  return { cur7: 20_000, prev7: 20_000, peak7: 40_000, createdMs: NOW - 400 * DAY, daysTracked: 60, nowMs: NOW, ...over };
}

describe("lifecycleStage", () => {
  it("calls a recent launch with 10k+ players a breakout, ahead of every other rule", () => {
    expect(lifecycleStage(input({ createdMs: NOW - 20 * DAY, cur7: 12_000, prev7: 1_000, peak7: 12_000 }))).toBe("breakout");
  });

  it("does not call a recent launch under 10k a breakout", () => {
    expect(lifecycleStage(input({ createdMs: NOW - 20 * DAY, cur7: 9_000, prev7: 9_000, peak7: 9_000 }))).toBe("peaking");
  });

  it("calls 25%+ week-on-week growth rising, even far below peak", () => {
    expect(lifecycleStage(input({ cur7: 12_500, prev7: 10_000, peak7: 100_000 }))).toBe("rising");
  });

  it("calls anything within 10% of its best week peaking", () => {
    expect(lifecycleStage(input({ cur7: 36_000, prev7: 38_000, peak7: 40_000 }))).toBe("peaking");
  });

  it("calls half of peak or less fading", () => {
    expect(lifecycleStage(input({ cur7: 20_000, prev7: 19_000, peak7: 40_000 }))).toBe("fading");
  });

  it("calls a drop on last week while above half of peak cooling", () => {
    expect(lifecycleStage(input({ cur7: 24_000, prev7: 28_000, peak7: 40_000 }))).toBe("cooling");
  });

  it("calls a long-tracked game holding level evergreen, and a newer one steady", () => {
    expect(lifecycleStage(input({ cur7: 26_000, prev7: 25_000, daysTracked: 150 }))).toBe("evergreen");
    expect(lifecycleStage(input({ cur7: 26_000, prev7: 25_000, daysTracked: 60 }))).toBe("steady");
  });

  it("handles a game with no previous week", () => {
    expect(lifecycleStage(input({ prev7: null, cur7: 5_000, peak7: 9_000 }))).toBe("steady");
  });
});
