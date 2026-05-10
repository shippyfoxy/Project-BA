// Pure proxy metrics for Roblox Pulse. None of these are ground-truth
// retention or session length — they are public-API-derivable proxies.
// All UI copy that surfaces them must say so.

export interface RetentionInputs {
  upVotes: number;
  downVotes: number;
  favoritedCount: number;
  playing: number;
  visits: number;
}

export interface SessionSample {
  ts: number;
  playing: number;
  visits: number;
}

export interface SessionInputs {
  earlier: SessionSample;
  later: SessionSample;
}

export type SessionBucket = "<5m" | "5-15m" | "15-30m" | "30m+";

const finite = (n: number): number =>
  Number.isFinite(n) && n > 0 ? n : 0;

const validNonNeg = (n: number): boolean =>
  Number.isFinite(n) && n >= 0;

export function likeRatio(upVotes: number, downVotes: number): number {
  if (!validNonNeg(upVotes) || !validNonNeg(downVotes)) return 0;
  const total = upVotes + downVotes;
  return total === 0 ? 0 : upVotes / total;
}

export function retentionProxy(g: RetentionInputs): number {
  // v2 formula (2026-05-10). The previous version divided by `visits / 24`,
  // which for established games (e.g. Brookhaven at 82B visits) collapsed
  // the score to ~zero — backwards from the business meaning of retention.
  // The new composite uses three log-scaled engagement signals and does NOT
  // penalise lifetime visits at all:
  //   retentionScore = likeRatio × log10(favoritedCount + 1) × log10(playing + 1)
  // Interpretation: high score = quality (likes) AND deep fandom (favourites)
  // AND active concurrent engagement. Brookhaven now ranks at the top, where
  // a game with 600k+ live players obviously belongs.
  const ratio = likeRatio(g.upVotes, g.downVotes);
  if (ratio === 0) return 0;

  const favs = finite(g.favoritedCount);
  const favTerm = Math.log10(favs + 1);
  if (favTerm === 0) return 0;

  const playing = finite(g.playing);
  if (playing === 0) return 0;
  const playingTerm = Math.log10(playing + 1);

  return ratio * favTerm * playingTerm;
}

export function estimatedSessionMinutes(g: SessionInputs): number | null {
  const intervalMs = g.later.ts - g.earlier.ts;
  if (intervalMs <= 0) return null;

  const intervalMinutes = intervalMs / 60_000;
  const newVisits = g.later.visits - g.earlier.visits;
  if (newVisits <= 0) return null;

  const playing = finite(g.later.playing);
  if (playing === 0) return null;

  const visitsPerMinute = newVisits / intervalMinutes;
  return playing / visitsPerMinute;
}

export function sessionBucket(minutes: number | null): SessionBucket | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 5) return "<5m";
  if (minutes < 15) return "5-15m";
  if (minutes < 30) return "15-30m";
  return "30m+";
}

export const SESSION_BUCKETS: SessionBucket[] = [
  "<5m",
  "5-15m",
  "15-30m",
  "30m+",
];
