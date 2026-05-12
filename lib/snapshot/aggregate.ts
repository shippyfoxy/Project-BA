import {
  retentionProxy,
  estimatedSessionMinutes,
  sessionBucket,
  SESSION_BUCKETS,
  type SessionBucket,
} from "@/lib/metrics";
import type { Snapshot, SnapshotGame } from "./schema";

export interface GenreRow {
  genre: string;
  count: number;
  retentionProxy: number;
  totalPlaying: number;
  totalVisits: number;
  topGames: TopGameRow[];
}

export interface CohortRow {
  bucket: SessionBucket;
  count: number;
  totalPlaying: number;
}

export interface KpiSummary {
  generatedAt: string;
  totalGames: number;
  totalPlaying: number;
  totalVisits: number;
  topGenre: string;
  cohortCoverage: number; // 0..1, fraction of games with usable cohort estimate
}

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

export function gameRetentionProxy(g: SnapshotGame): number {
  return retentionProxy({
    upVotes: g.upVotes,
    downVotes: g.downVotes,
    favoritedCount: g.favoritedCount,
    playing: g.playing,
    visits: g.visits,
  });
}

export function gameSessionMinutes(g: SnapshotGame): number | null {
  if (g.samples.length < 2) return null;
  const earlier = g.samples[g.samples.length - 2];
  const later = g.samples[g.samples.length - 1];
  return estimatedSessionMinutes({ earlier, later });
}

// Returns the UTC hour (0-23) where this game averages the most concurrent
// players across its sample history. Needs at least 2 distinct hours to be
// meaningful — single-hour data can't distinguish peak from baseline.
export function gamePeakHourUTC(g: SnapshotGame): number | null {
  if (g.samples.length < 2) return null;
  const hourSums = new Map<number, { sum: number; count: number }>();
  for (const s of g.samples) {
    const h = new Date(s.ts).getUTCHours();
    const entry = hourSums.get(h) ?? { sum: 0, count: 0 };
    entry.sum += s.playing;
    entry.count++;
    hourSums.set(h, entry);
  }
  if (hourSums.size < 2) return null;
  let bestHour = -1;
  let bestAvg = -Infinity;
  for (const [h, { sum, count }] of hourSums) {
    const avg = sum / count;
    if (avg > bestAvg) { bestAvg = avg; bestHour = h; }
  }
  return bestHour >= 0 ? bestHour : null;
}

// Returns the UTC hour where the combined concurrent count across a group of
// games is highest — summing all samples grouped by hour. Avoids the circular-
// median problem (23 and 0 are adjacent) by working on totals, not per-game peaks.
function groupPeakHourUTC(games: SnapshotGame[]): number | null {
  const hourSums = new Map<number, number>();
  for (const g of games) {
    for (const s of g.samples) {
      const h = new Date(s.ts).getUTCHours();
      hourSums.set(h, (hourSums.get(h) ?? 0) + s.playing);
    }
  }
  if (hourSums.size < 2) return null;
  let bestHour = -1;
  let bestSum = -Infinity;
  for (const [h, sum] of hourSums) {
    if (sum > bestSum) { bestSum = sum; bestHour = h; }
  }
  return bestHour >= 0 ? bestHour : null;
}

// Roblox's `genre_l1` field includes a few bookkeeping buckets that aren't
// actually playstyle categories — we drop them so the chart shows real genres.
const NON_GENRES = new Set([
  "All",
  "Education",
  "Entertainment",
  "Shopping",
  "Social",
  "Other",
]);

export function topGenresByRetention(
  snapshot: Snapshot,
  limit = 8,
  minGamesPerGenre = 3,
): GenreRow[] {
  const groups = new Map<string, SnapshotGame[]>();
  for (const g of snapshot.games) {
    const key = g.genreL1 || "Other";
    if (NON_GENRES.has(key)) continue;
    const arr = groups.get(key) ?? [];
    arr.push(g);
    groups.set(key, arr);
  }

  const rows: GenreRow[] = [];
  for (const [genre, gs] of groups) {
    if (gs.length < minGamesPerGenre) continue;
    rows.push({
      genre,
      count: gs.length,
      retentionProxy: mean(gs.map(gameRetentionProxy)),
      totalPlaying: gs.reduce((a, b) => a + b.playing, 0),
      totalVisits: gs.reduce((a, b) => a + b.visits, 0),
      topGames: [...gs]
        .sort((a, b) => gameRetentionProxy(b) - gameRetentionProxy(a))
        .slice(0, 8)
        .map(toTopGameRow),
    });
  }

  rows.sort((a, b) => b.retentionProxy - a.retentionProxy);
  return rows.slice(0, limit);
}

export function sessionCohorts(snapshot: Snapshot): CohortRow[] {
  const counts: Record<SessionBucket, { count: number; totalPlaying: number }> = {
    "<5m": { count: 0, totalPlaying: 0 },
    "5-15m": { count: 0, totalPlaying: 0 },
    "15-30m": { count: 0, totalPlaying: 0 },
    "30m+": { count: 0, totalPlaying: 0 },
  };
  for (const g of snapshot.games) {
    const minutes = gameSessionMinutes(g);
    const bucket = sessionBucket(minutes);
    if (!bucket) continue;
    counts[bucket].count += 1;
    counts[bucket].totalPlaying += g.playing;
  }
  return SESSION_BUCKETS.map((b) => ({
    bucket: b,
    count: counts[b].count,
    totalPlaying: counts[b].totalPlaying,
  }));
}

export function summarise(snapshot: Snapshot): KpiSummary {
  const totalGames = snapshot.games.length;
  const totalPlaying = snapshot.games.reduce((a, b) => a + b.playing, 0);
  const totalVisits = snapshot.games.reduce((a, b) => a + b.visits, 0);
  const cohortable = snapshot.games.filter((g) => gameSessionMinutes(g) !== null).length;

  const genres = topGenresByRetention(snapshot, 1, 1);
  const topGenre = genres[0]?.genre ?? "—";

  return {
    generatedAt: snapshot.generatedAt,
    totalGames,
    totalPlaying,
    totalVisits,
    topGenre,
    cohortCoverage: totalGames === 0 ? 0 : cohortable / totalGames,
  };
}

export interface TopGameRow {
  universeId: number;
  name: string;
  creatorName: string;
  genreL1: string;
  playing: number;
  visits: number;
  retentionProxy: number;
  canonicalUrlPath: string;
}

function toTopGameRow(g: SnapshotGame): TopGameRow {
  return {
    universeId: g.universeId,
    name: g.name,
    creatorName: g.creatorName,
    genreL1: g.genreL1,
    playing: g.playing,
    visits: g.visits,
    retentionProxy: gameRetentionProxy(g),
    canonicalUrlPath: g.canonicalUrlPath,
  };
}

export function topGamesByRetention(
  snapshot: Snapshot,
  limit = 10,
): TopGameRow[] {
  return snapshot.games
    .map(toTopGameRow)
    .sort((a, b) => b.retentionProxy - a.retentionProxy)
    .slice(0, limit);
}

export function topGamesByConcurrent(
  snapshot: Snapshot,
  limit = 10,
): TopGameRow[] {
  return snapshot.games
    .map(toTopGameRow)
    .sort((a, b) => b.playing - a.playing)
    .slice(0, limit);
}

// --- Unified leaderboard --------------------------------------------------

export interface UnifiedGameRow {
  universeId: number;
  name: string;
  creatorName: string;
  genreL1: string;
  playing: number;
  visits: number;
  retentionProxy: number;
  canonicalUrlPath: string;
  // Concurrent players from oldest to newest sample, used for sparkline.
  concurrencySeries: number[];
  // Signed change between first and last sample (null if <2 samples).
  concurrencyDelta: number | null;
  // Same change as a fraction (e.g. 0.05 = +5%, -0.1 = -10%). Null if <2 samples.
  concurrencyDeltaPct: number | null;
}

function toUnifiedRow(g: SnapshotGame): UnifiedGameRow {
  const series = g.samples.map((s) => s.playing);
  let delta: number | null = null;
  let deltaPct: number | null = null;
  if (series.length >= 2) {
    const first = series[0];
    const last = series[series.length - 1];
    delta = last - first;
    deltaPct = first === 0 ? null : delta / first;
  }
  return {
    universeId: g.universeId,
    name: g.name,
    creatorName: g.creatorName,
    genreL1: g.genreL1,
    playing: g.playing,
    visits: g.visits,
    retentionProxy: gameRetentionProxy(g),
    canonicalUrlPath: g.canonicalUrlPath,
    concurrencySeries: series,
    concurrencyDelta: delta,
    concurrencyDeltaPct: deltaPct,
  };
}

// One leaderboard, many lenses. Returns the top `limit` games by the largest
// magnitude across any of the supported sorts so the client can re-rank locally
// without losing rows. We over-select then rely on the client to slice.
export function topGamesUnified(snapshot: Snapshot, limit = 25): UnifiedGameRow[] {
  const rows = snapshot.games.map(toUnifiedRow);
  // Pick the union of the top `limit` per sort dimension so any client-side
  // re-sort surfaces the right set.
  const dimensions: Array<(r: UnifiedGameRow) => number> = [
    (r) => r.playing,
    (r) => r.visits,
    (r) => r.retentionProxy,
    (r) => r.concurrencyDelta ?? -Infinity,
  ];
  const picked = new Map<number, UnifiedGameRow>();
  for (const score of dimensions) {
    [...rows]
      .sort((a, b) => score(b) - score(a))
      .slice(0, limit)
      .forEach((r) => picked.set(r.universeId, r));
  }
  return [...picked.values()].sort((a, b) => b.retentionProxy - a.retentionProxy);
}

// --- Genre x age recommendation -------------------------------------------

export interface GenreAgeRow {
  genre: string;
  ageRecommendation: string;
  gameCount: number;
  // Raw mean across this combo — vulnerable to small-sample noise.
  meanRetentionProxy: number;
  // Shrinkage-adjusted mean: pulls small-sample combos toward the global mean
  // so a 7-game combo can't outrank a 200-game combo on the strength of two
  // outliers. This is the value the table sorts on.
  adjustedRetentionProxy: number;
  meanSessionMinutes: number | null;
  totalPlaying: number;
  // Share of total concurrent players across the catalogue (0..1). Lets
  // executives see niche-vs-mainstream alongside the retention score.
  shareOfPlayers: number;
  topGames: TopGameRow[];
  // UTC hour (0-23) when combined concurrent players in this combo is highest
  // across all sample history. Null when fewer than 2 distinct hours are recorded.
  peakHourUTC: number | null;
}

const AGE_FALLBACK = "Unknown maturity";

// Effective "prior sample size" for the shrinkage estimator. With k=20, a
// combo of 7 games is pulled 74% toward the global mean; a combo of 200 games
// is pulled only 9% — so big samples are trusted, small samples are dampened.
const RETENTION_SHRINKAGE_K = 20;

// Default minimum sample size. Single-digit-game combos are too noisy to
// drive a content-investment decision and are filtered out entirely.
const DEFAULT_MIN_GAMES_PER_COMBO = 10;

// Surfaces (genre, age recommendation) combos ranked by *shrinkage-adjusted*
// mean retention proxy — putting small and large samples on equal footing.
export function retentionByGenreAndAge(
  snapshot: Snapshot,
  limit = 10,
  minGamesPerCombo = DEFAULT_MIN_GAMES_PER_COMBO,
): GenreAgeRow[] {
  const groups = new Map<string, SnapshotGame[]>();
  const eligibleGames: SnapshotGame[] = [];
  for (const g of snapshot.games) {
    const genre = g.genreL1 || "Other";
    if (NON_GENRES.has(genre)) continue;
    eligibleGames.push(g);
    const age = g.ageRecommendation || AGE_FALLBACK;
    const key = `${genre}|${age}`;
    const arr = groups.get(key) ?? [];
    arr.push(g);
    groups.set(key, arr);
  }

  // Global baselines for shrinkage and share computation.
  const globalMeanProxy = mean(eligibleGames.map(gameRetentionProxy));
  const totalPlayers = eligibleGames.reduce((a, b) => a + b.playing, 0);

  const rows: GenreAgeRow[] = [];
  for (const [key, gs] of groups) {
    if (gs.length < minGamesPerCombo) continue;
    const [genre, ageRecommendation] = key.split("|");
    const sampleMean = mean(gs.map(gameRetentionProxy));
    const adjusted =
      (gs.length * sampleMean + RETENTION_SHRINKAGE_K * globalMeanProxy) /
      (gs.length + RETENTION_SHRINKAGE_K);
    const sessionValues = gs
      .map(gameSessionMinutes)
      .filter((m): m is number => m !== null);
    const totalPlaying = gs.reduce((a, b) => a + b.playing, 0);
    rows.push({
      genre,
      ageRecommendation,
      gameCount: gs.length,
      meanRetentionProxy: sampleMean,
      adjustedRetentionProxy: adjusted,
      meanSessionMinutes:
        sessionValues.length === 0 ? null : mean(sessionValues),
      totalPlaying,
      shareOfPlayers: totalPlayers === 0 ? 0 : totalPlaying / totalPlayers,
      topGames: [...gs]
        .sort((a, b) => gameRetentionProxy(b) - gameRetentionProxy(a))
        .slice(0, 8)
        .map(toTopGameRow),
      peakHourUTC: groupPeakHourUTC(gs),
    });
  }

  rows.sort((a, b) => b.adjustedRetentionProxy - a.adjustedRetentionProxy);
  return rows.slice(0, limit);
}

// --- Region breakdown -----------------------------------------------------

export interface RegionTopGame {
  universeId: number;
  name: string;
  creatorName: string;
  genreL1: string;
  playing: number;
  retentionProxy: number;
  canonicalUrlPath: string;
}

export interface RegionGenreShare {
  genre: string;
  gameCount: number;
  sharePct: number; // 0..100, share of this region's games
}

export interface RegionAgeShare {
  ageRecommendation: string;
  gameCount: number;
  sharePct: number;
}

export interface RegionRow {
  country: string;             // ISO-2 lowercase, e.g. "us"
  countryName: string;         // human label
  isBaseline: boolean;         // true if this is the comparison baseline (US)
  gameCount: number;           // games that surfaced in this region's explore sorts
  totalPlaying: number;
  meanRetentionProxy: number;
  topGenre: string;            // genre with the most games in this region
  // Drill-down payload — used by the expandable region cards.
  topGames: RegionTopGame[];
  // Games promoted ONLY in this region and not in the baseline (US) set.
  // This is the regional flavour view — the others all show Brookhaven et al.
  // Empty for the baseline region itself.
  uniqueToRegion: RegionTopGame[];
  topGenres: RegionGenreShare[];
  ageMix: RegionAgeShare[];
}

// ISO-2 → display name. Only the countries we currently fan out to, plus the
// fallback for anything else that might appear later.
const COUNTRY_NAMES: Record<string, string> = {
  us: "United States",
  gb: "United Kingdom",
  br: "Brazil",
  jp: "Japan",
  kr: "South Korea",
  de: "Germany",
  ru: "Russia",
  ph: "Philippines",
  in: "India",
  mx: "Mexico",
  id: "Indonesia",
  tr: "Turkey",
};

function genreShares(
  games: SnapshotGame[],
  limit: number,
): RegionGenreShare[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    const k = g.genreL1 || "Other";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = games.length || 1;
  return [...counts.entries()]
    .map(([genre, gameCount]) => ({
      genre,
      gameCount,
      sharePct: (gameCount / total) * 100,
    }))
    .sort((a, b) => b.gameCount - a.gameCount)
    .slice(0, limit);
}

function ageShares(games: SnapshotGame[]): RegionAgeShare[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    const k = g.ageRecommendation || AGE_FALLBACK;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = games.length || 1;
  return [...counts.entries()]
    .map(([ageRecommendation, gameCount]) => ({
      ageRecommendation,
      gameCount,
      sharePct: (gameCount / total) * 100,
    }))
    .sort((a, b) => b.gameCount - a.gameCount);
}

function topGamesForRegion(games: SnapshotGame[], limit: number): RegionTopGame[] {
  return [...games]
    .sort((a, b) => b.playing - a.playing)
    .slice(0, limit)
    .map((g) => ({
      universeId: g.universeId,
      name: g.name,
      creatorName: g.creatorName,
      genreL1: g.genreL1,
      playing: g.playing,
      retentionProxy: gameRetentionProxy(g),
      canonicalUrlPath: g.canonicalUrlPath,
    }));
}

// US/computer is the implicit baseline because it is what Roblox returns by
// default — every other region is interesting only insofar as it differs.
const REGION_BASELINE = "us";

// Buckets games by every country they appeared in (a game can count toward
// multiple regions). Each row carries top games / unique-to-region games /
// genre mix / age mix for the expandable drill-down view.
export function regionBreakdown(snapshot: Snapshot): RegionRow[] {
  const groups = new Map<string, SnapshotGame[]>();
  for (const g of snapshot.games) {
    for (const country of g.popularInCountries) {
      const arr = groups.get(country) ?? [];
      arr.push(g);
      groups.set(country, arr);
    }
  }

  const baselineIds = new Set(
    (groups.get(REGION_BASELINE) ?? []).map((g) => g.universeId),
  );

  const rows: RegionRow[] = [];
  for (const [country, gs] of groups) {
    const genres = genreShares(gs, 5);
    const isBaseline = country === REGION_BASELINE;
    const uniqueGames = isBaseline
      ? []
      : gs.filter((g) => !baselineIds.has(g.universeId));
    rows.push({
      country,
      countryName: COUNTRY_NAMES[country] ?? country.toUpperCase(),
      isBaseline,
      gameCount: gs.length,
      totalPlaying: gs.reduce((a, b) => a + b.playing, 0),
      meanRetentionProxy: mean(gs.map(gameRetentionProxy)),
      topGenre: genres[0]?.genre ?? "—",
      topGames: topGamesForRegion(gs, 5),
      uniqueToRegion: topGamesForRegion(uniqueGames, 5),
      topGenres: genres,
      ageMix: ageShares(gs),
    });
  }

  rows.sort((a, b) => b.totalPlaying - a.totalPlaying);
  return rows;
}
