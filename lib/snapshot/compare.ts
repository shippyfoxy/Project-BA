import { sessionBucket, SESSION_BUCKETS, type SessionBucket } from "@/lib/metrics";
import { gameRetentionProxy, gameSessionMinutes } from "@/lib/snapshot/aggregate";
import { estMonthlyDevEx } from "@/lib/trends/revenue";
import { quantile } from "@/lib/stats";
import type { SnapshotGame } from "./schema";

export type DeviceFilter = "Phone" | "Tablet" | "Desktop" | "Console";

export interface GroupFilter {
  genres: string[];       // empty = all genres
  ageRatings: string[];   // empty = all; null ageRecommendation never matches a non-empty filter
  devices: DeviceFilter[]; // empty = any device; non-empty = must overlap popularOnDevices
}

export type SessionBucketDistribution = Record<SessionBucket, number>;

export interface GroupMetrics {
  gameCount: number;
  retentionMean: number;
  retentionMedian: number;
  sessionMean: number | null;
  sessionBuckets: SessionBucketDistribution;
  voteRatioPct: number;
  concurrentMedian: number;
  concurrentTotal: number;
  favoritesMedian: number;
  rankedCount: number; // games in Roblox's Top Earning list
  estRevenueTotal: number; // MODELLED monthly DevEx (USD), summed over ranked games
  estRevenueMedian: number | null; // MODELLED, median ranked game
}

export interface MetricDelta {
  a: number | null;
  b: number | null;
  deltaPct: number | null;
  winner: "A" | "B" | "tie" | null;
}

export interface ComparisonResult {
  a: GroupMetrics;
  b: GroupMetrics;
  deltas: {
    retentionMean: MetricDelta;
    retentionMedian: MetricDelta;
    sessionMean: MetricDelta;
    voteRatioPct: MetricDelta;
    concurrentMedian: MetricDelta;
    concurrentTotal: MetricDelta;
    favoritesMedian: MetricDelta;
    rankedCount: MetricDelta;
    estRevenueTotal: MetricDelta;
    estRevenueMedian: MetricDelta;
  };
}

const NON_GENRES = new Set([
  "All",
  "Education",
  "Entertainment",
  "Shopping",
  "Social",
  "Other",
]);

export function availableGenres(games: SnapshotGame[]): string[] {
  const seen = new Set<string>();
  for (const g of games) {
    if (g.genreL1 && !NON_GENRES.has(g.genreL1)) seen.add(g.genreL1);
  }
  return [...seen].sort();
}

export function availableAgeRatings(games: SnapshotGame[]): string[] {
  const seen = new Set<string>();
  for (const g of games) {
    if (g.ageRecommendation) seen.add(g.ageRecommendation);
  }
  return [...seen].sort();
}

// Maps user-facing filter labels to the raw strings stored in popularOnDevices.
const DEVICE_VALUES: Record<DeviceFilter, string[]> = {
  Desktop: ["computer"],
  Console: ["console"],
  Phone: ["high_end_phone", "low_end_phone"],
  Tablet: ["high_end_tablet"],
};

export function applyFilter(games: SnapshotGame[], filter: GroupFilter): SnapshotGame[] {
  return games.filter((g) => {
    if (filter.genres.length > 0 && !filter.genres.includes(g.genreL1)) return false;
    if (filter.ageRatings.length > 0) {
      if (!g.ageRecommendation || !filter.ageRatings.includes(g.ageRecommendation)) return false;
    }
    if (filter.devices.length > 0) {
      const stored = filter.devices.flatMap((d) => DEVICE_VALUES[d]);
      const hasOverlap = stored.some((v) => g.popularOnDevices.includes(v));
      if (!hasOverlap) return false;
    }
    return true;
  });
}

function median(sorted: number[]): number {
  return sorted.length === 0 ? 0 : quantile(sorted, 0.5);
}

export function computeGroupMetrics(games: SnapshotGame[]): GroupMetrics {
  if (games.length === 0) {
    return {
      gameCount: 0,
      retentionMean: 0,
      retentionMedian: 0,
      sessionMean: null,
      sessionBuckets: { "<5m": 0, "5-15m": 0, "15-30m": 0, "30m+": 0 },
      voteRatioPct: 0,
      concurrentMedian: 0,
      concurrentTotal: 0,
      favoritesMedian: 0,
      rankedCount: 0,
      estRevenueTotal: 0,
      estRevenueMedian: null,
    };
  }

  const retentionScores = games.map(gameRetentionProxy).sort((a, b) => a - b);
  const retentionMean = retentionScores.reduce((a, b) => a + b, 0) / retentionScores.length;
  const retentionMedian = median(retentionScores);

  const sessionValues: number[] = [];
  const bucketCounts: Record<SessionBucket, number> = {
    "<5m": 0,
    "5-15m": 0,
    "15-30m": 0,
    "30m+": 0,
  };
  for (const g of games) {
    const mins = gameSessionMinutes(g);
    if (mins === null) continue;
    sessionValues.push(mins);
    const b = sessionBucket(mins);
    if (b) bucketCounts[b] += 1;
  }
  const sessionMean =
    sessionValues.length === 0
      ? null
      : sessionValues.reduce((a, b) => a + b, 0) / sessionValues.length;
  const sessionTotal = sessionValues.length || 1;
  const sessionBuckets: SessionBucketDistribution = {
    "<5m": bucketCounts["<5m"] / sessionTotal,
    "5-15m": bucketCounts["5-15m"] / sessionTotal,
    "15-30m": bucketCounts["15-30m"] / sessionTotal,
    "30m+": bucketCounts["30m+"] / sessionTotal,
  };

  let totalUp = 0;
  let totalDown = 0;
  for (const g of games) {
    totalUp += g.upVotes;
    totalDown += g.downVotes;
  }
  const voteRatioPct = totalUp + totalDown === 0 ? 0 : (totalUp / (totalUp + totalDown)) * 100;

  const concurrents = games.map((g) => g.playing).sort((a, b) => a - b);
  const concurrentMedian = median(concurrents);
  const concurrentTotal = concurrents.reduce((a, b) => a + b, 0);

  const favorites = games.map((g) => g.favoritedCount).sort((a, b) => a - b);
  const favoritesMedian = median(favorites);

  const revenues = games
    .map((g) => estMonthlyDevEx(g.earningRank)?.mid)
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);

  return {
    gameCount: games.length,
    retentionMean,
    retentionMedian,
    sessionMean,
    sessionBuckets,
    voteRatioPct,
    concurrentMedian,
    concurrentTotal,
    favoritesMedian,
    rankedCount: revenues.length,
    estRevenueTotal: revenues.reduce((a, b) => a + b, 0),
    estRevenueMedian: revenues.length ? median(revenues) : null,
  };
}

function computeDelta(a: number | null, b: number | null): MetricDelta {
  // A group with no data for a metric neither wins nor loses on it.
  if (a === null || b === null) return { a, b, deltaPct: null, winner: null };
  const aVal = a ?? 0;
  const bVal = b ?? 0;
  const deltaPct = aVal === 0 ? null : ((bVal - aVal) / Math.abs(aVal)) * 100;
  let winner: MetricDelta["winner"];
  if (aVal === bVal) winner = "tie";
  else winner = aVal > bVal ? "A" : "B";
  return { a: aVal, b: bVal, deltaPct, winner };
}

export function compareGroups(
  groupA: SnapshotGame[],
  groupB: SnapshotGame[],
): ComparisonResult {
  const a = computeGroupMetrics(groupA);
  const b = computeGroupMetrics(groupB);
  return {
    a,
    b,
    deltas: {
      retentionMean: computeDelta(a.retentionMean, b.retentionMean),
      retentionMedian: computeDelta(a.retentionMedian, b.retentionMedian),
      sessionMean: computeDelta(a.sessionMean, b.sessionMean),
      voteRatioPct: computeDelta(a.voteRatioPct, b.voteRatioPct),
      concurrentMedian: computeDelta(a.concurrentMedian, b.concurrentMedian),
      concurrentTotal: computeDelta(a.concurrentTotal, b.concurrentTotal),
      favoritesMedian: computeDelta(a.favoritesMedian, b.favoritesMedian),
      rankedCount: computeDelta(a.rankedCount, b.rankedCount),
      estRevenueTotal: computeDelta(a.estRevenueTotal, b.estRevenueTotal),
      estRevenueMedian: computeDelta(a.estRevenueMedian, b.estRevenueMedian),
    },
  };
}

export { SESSION_BUCKETS };
