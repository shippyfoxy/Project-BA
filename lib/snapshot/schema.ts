// Snapshot is the only thing the dashboard reads. refresh-data writes it,
// the dashboard renders it. Keeping it small and self-contained means the
// site works on a Vercel cold start with zero outbound calls.

export interface SnapshotSample {
  ts: number;        // ms since epoch
  playing: number;
  visits: number;
}

export interface SnapshotGame {
  universeId: number;
  rootPlaceId: number;
  name: string;
  creatorName: string;
  genreL1: string;
  genreL2: string;
  visits: number;
  favoritedCount: number;
  upVotes: number;
  downVotes: number;
  playing: number;
  created: string;
  updated: string;
  canonicalUrlPath: string;
  // Rolling list of (ts, playing, visits) readings — newest last.
  // Cohort proxy uses the last two.
  samples: SnapshotSample[];
}

export interface Snapshot {
  generatedAt: string;
  generatedAtMs: number;
  source: "explore-api+games-api";
  games: SnapshotGame[];
}

export const SNAPSHOT_VERSION = 1;
