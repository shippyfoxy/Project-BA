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
  const ratio = likeRatio(g.upVotes, g.downVotes);
  if (ratio === 0) return 0;

  const favs = finite(g.favoritedCount);
  const favTerm = Math.log10(favs + 1);
  if (favTerm === 0) return 0;

  const playing = finite(g.playing);
  if (playing === 0) return 0;

  const visits = finite(g.visits);
  // visits/24 reads "visits per hour assuming a 24-hour spread".
  // The floor of 1 prevents tiny new games from blowing the metric up.
  const visitRate = Math.max(visits / 24, 1);

  return ratio * favTerm * (playing / visitRate);
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
