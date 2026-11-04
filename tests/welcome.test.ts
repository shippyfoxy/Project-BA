import { describe, expect, it } from "vitest";
import type { BadgeRecord } from "@/lib/roblox/client";
import { newShare, pickWelcomeBadge } from "@/lib/trends/welcome";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const badge = (id: number, name: string, created = "2024-01-01T00:00:00Z", awarded = 1_000, enabled = true): BadgeRecord => ({
  id,
  name,
  enabled,
  created,
  statistics: { pastDayAwardedCount: 10, awardedCount: awarded },
});

describe("Welcome badges", () => {
  it("finds a first-join badge and skips the rest", () => {
    const picked = pickWelcomeBadge([badge(1, "The Hunt: First Edition"), badge(2, "Welcome! 🐾"), badge(3, "Welcome Back!")], NOW);
    expect(picked?.id).toBe(2);
    expect(pickWelcomeBadge([badge(1, "Thanks for playing")], NOW)?.id).toBe(1);
    expect(pickWelcomeBadge([badge(1, "You Joined!")], NOW)?.id).toBe(1);
  });

  it("leaves out returning-player, disabled and recently added badges", () => {
    expect(pickWelcomeBadge([badge(1, "Welcome Back!")], NOW)).toBeNull();
    expect(pickWelcomeBadge([badge(1, "Welcome", "2024-01-01T00:00:00Z", 1, false)], NOW)).toBeNull();
    expect(pickWelcomeBadge([badge(1, "Welcome", "2026-10-22T00:00:00Z")], NOW)).toBeNull();
  });

  it("accepts a recent badge made alongside a new game", () => {
    const launch = Date.parse("2026-09-10T00:00:00Z");
    expect(pickWelcomeBadge([badge(1, "Welcome", "2026-09-12T00:00:00Z")], NOW, launch)?.id).toBe(1);
    expect(pickWelcomeBadge([badge(1, "Played Practical Basketball", "2026-09-12T00:00:00Z")], NOW, launch)?.id).toBe(1);
    expect(pickWelcomeBadge([badge(1, "Welcome", "2026-10-22T00:00:00Z")], NOW, launch)).toBeNull();
  });

  it("prefers the most awarded of several", () => {
    expect(pickWelcomeBadge([badge(1, "Welcome", undefined, 50), badge(2, "Welcome!", undefined, 5_000)], NOW)?.id).toBe(2);
  });

  it("only gives a share when it can be one", () => {
    expect(newShare(250, 1_000)).toBe(0.25);
    expect(newShare(1_200, 1_000)).toBeNull();
    expect(newShare(10, 100)).toBeNull();
    expect(newShare(null, 1_000)).toBeNull();
  });
});
