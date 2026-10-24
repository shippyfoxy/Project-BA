// Game icons from thumbnails.roblox.com (documented as Stable, no key).
// The returned links carry a "180DAY" prefix and expire, so they are fetched
// fresh with each page regeneration rather than stored.

const UA = "roblox-pulse/0.2 (+https://pulse.shipfox.me)";
const BATCH = 50;

export async function getGameIcons(universeIds: number[]): Promise<Map<number, string>> {
  const icons = new Map<number, string>();
  const ids = [...new Set(universeIds)];
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const url =
      "https://thumbnails.roblox.com/v1/games/icons" +
      `?universeIds=${chunk.join(",")}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 3600 } });
      if (!res.ok) continue;
      const body = (await res.json()) as { data?: { targetId: number; state: string; imageUrl: string | null }[] };
      for (const d of body.data ?? []) {
        if (d.state === "Completed" && d.imageUrl?.startsWith("https://tr.rbxcdn.com/")) icons.set(d.targetId, d.imageUrl);
      }
    } catch {
      // Icons are decoration: on failure the page shows letter tiles instead.
    }
  }
  return icons;
}
