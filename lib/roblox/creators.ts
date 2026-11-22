// A studio's public games straight from Roblox (games.roblox.com, no key),
// including ones that never reached the discovery lists and so have no
// history here. Fetched at most hourly per studio, like thumbnails.

const UA = "roblox-pulse/0.2 (+https://pulse.shipfox.me)";

export type CreatorKind = "group" | "user";

export interface CreatorGame {
  universeId: number;
  name: string;
  createdMs: number;
  updatedMs: number;
  visits: number;
  playing: number | null; // now
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 3600 } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// Up to 100 games, newest first; null when Roblox can't be reached.
export async function getCreatorGames(kind: CreatorKind, id: number): Promise<{ name: string | null; games: CreatorGame[] } | null> {
  const base =
    kind === "group"
      ? `https://games.roblox.com/v2/groups/${id}/gamesV2?accessFilter=Public&limit=50&sortOrder=Desc`
      : `https://games.roblox.com/v2/users/${id}/games?accessFilter=Public&limit=50&sortOrder=Desc`;
  type Page = { data?: { id: number; name: string; created: string; updated: string; placeVisits: number }[]; nextPageCursor?: string | null };
  const first = await json<Page>(base);
  if (!first) return null;
  const pages = [first];
  if (first.nextPageCursor) {
    const next = await json<Page>(`${base}&cursor=${encodeURIComponent(first.nextPageCursor)}`);
    if (next) pages.push(next);
  }
  const listed = pages.flatMap((p) => p.data ?? []);
  // Current players and the creator's display name come from the games endpoint, 50 at a time.
  const live = new Map<number, number>();
  let name: string | null = null;
  for (let i = 0; i < listed.length; i += 50) {
    const ids = listed.slice(i, i + 50).map((g) => g.id).join(",");
    const body = await json<{ data?: { id: number; playing: number; creator?: { name: string } }[] }>(`https://games.roblox.com/v1/games?universeIds=${ids}`);
    for (const g of body?.data ?? []) {
      live.set(g.id, g.playing);
      name ??= g.creator?.name ?? null;
    }
  }
  return {
    name,
    games: listed.map((g) => ({
      universeId: g.id,
      name: g.name,
      createdMs: Date.parse(g.created),
      updatedMs: Date.parse(g.updated),
      visits: g.placeVisits,
      playing: live.get(g.id) ?? null,
    })),
  };
}
