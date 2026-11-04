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
  // Age targeting from explore-api: minimumAge is a numeric floor (e.g. 5, 9, 13),
  // ageRecommendation is the human label ("Maturity: Minimal", "Maturity: Mild", ...).
  // Both are nullable because they are absent from games we never saw via explore-api.
  minimumAge: number | null;
  ageRecommendation: string | null;
  // ISO-2 country codes / device classes where this game appeared in an
  // explore-api sort during the last refresh. Used for the regional breakdown.
  popularInCountries: string[];
  popularOnDevices: string[];
  // Rolling list of (ts, playing, visits) readings — newest last.
  // Cohort proxy uses the last two.
  samples: SnapshotSample[];
  // Position in Roblox's Top Earning list on the latest day recorded.
  earningRank?: number | null;
  earningEffRank?: number | null; // over the last 7 lists; estimates come from this
}

export interface Snapshot {
  generatedAt: string;
  generatedAtMs: number;
  source: "explore-api+games-api";
  games: SnapshotGame[];
  // Position in Roblox's Top Earning list at refresh time (7-day Robux spend).
  topEarning?: { universeId: number; rank: number }[];
}

export const SNAPSHOT_VERSION = 1;
