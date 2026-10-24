export type Stage = "breakout" | "rising" | "peaking" | "cooling" | "fading" | "evergreen" | "steady";

export const STAGES: Stage[] = ["breakout", "rising", "peaking", "cooling", "fading", "evergreen", "steady"];

export interface StageInput {
  cur7: number; // 7-day average players, this week
  prev7: number | null; // same, the week before
  peak7: number; // best 7-day average ever recorded
  createdMs: number | null;
  daysTracked: number;
  nowMs: number;
}

const DAY_MS = 86_400_000;

// Rules are checked in order; the first that matches wins. Documented on the
// API page, so change both together.
export function lifecycleStage(g: StageInput): Stage {
  if (g.createdMs !== null && g.nowMs - g.createdMs <= 30 * DAY_MS && g.cur7 >= 10_000) return "breakout";
  if (g.prev7 && g.cur7 >= 1.25 * g.prev7) return "rising";
  if (g.cur7 >= 0.9 * g.peak7) return "peaking";
  if (g.cur7 <= 0.5 * g.peak7) return "fading";
  if (g.prev7 && g.cur7 < g.prev7) return "cooling";
  if (g.daysTracked >= 120) return "evergreen";
  return "steady";
}
