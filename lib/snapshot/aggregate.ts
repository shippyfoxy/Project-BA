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
  retentionProxy: number;
  canonicalUrlPath: string;
}

export function topGamesByRetention(
  snapshot: Snapshot,
  limit = 10,
): TopGameRow[] {
  return snapshot.games
    .map((g) => ({
      universeId: g.universeId,
      name: g.name,
      creatorName: g.creatorName,
      genreL1: g.genreL1,
      playing: g.playing,
      retentionProxy: gameRetentionProxy(g),
      canonicalUrlPath: g.canonicalUrlPath,
    }))
    .sort((a, b) => b.retentionProxy - a.retentionProxy)
    .slice(0, limit);
}
