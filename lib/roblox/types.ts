// Wire-format types for the Roblox endpoints we touch. Confirmed against
// live responses on 2026-05-06; see memory/reference_roblox_api.md.

export interface ExploreGame {
  universeId: number;
  rootPlaceId: number;
  name: string;
  playerCount: number;
  totalUpVotes: number;
  totalDownVotes: number;
  isSponsored: boolean;
  nativeAdData: string;
  minimumAge: number;
  ageRecommendationDisplayName: string;
}

export interface ExploreSort {
  sortId: string;
  contentType: "Games" | "Filters" | string;
  treatmentType: string;
  sortDisplayName: string;
  games?: ExploreGame[];
}

export interface ExploreSortsResponse {
  sorts: ExploreSort[];
}

export interface GameCreator {
  id: number;
  name: string;
  type: "User" | "Group" | string;
  hasVerifiedBadge?: boolean;
}

export interface GameRecord {
  id: number;
  rootPlaceId: number;
  name: string;
  description: string | null;
  creator: GameCreator;
  playing: number;
  visits: number;
  maxPlayers: number;
  created: string;
  updated: string;
  genre: string;        // legacy taxonomy
  genre_l1: string;     // new taxonomy ("Roleplay & Avatar Sim", "Combat", ...)
  genre_l2: string;
  favoritedCount: number;
  canonicalUrlPath: string;
  isAllGenre: boolean;
}

export interface GamesBatchResponse {
  data: GameRecord[];
}

export interface VoteRecord {
  id: number;
  upVotes: number;
  downVotes: number;
}

export interface VotesBatchResponse {
  data: VoteRecord[];
}

export interface ServerRecord {
  id: string;
  maxPlayers: number;
  playing: number;
  fps: number;
  ping: number;
}

export interface ServersResponse {
  previousPageCursor: string | null;
  nextPageCursor: string | null;
  data: ServerRecord[];
}
