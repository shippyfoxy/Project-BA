import { getSiteDb } from "@/lib/db/site";
import { breakoutItems, renderRss } from "@/lib/feeds";

export const revalidate = 3600;

export async function GET() {
  const db = getSiteDb();
  const items = db ? await breakoutItems(db).catch(() => []) : [];
  return new Response(
    renderRss(
      {
        title: "Roblox Pulse: breakouts",
        path: "/feeds/breakouts.xml",
        description: "New Roblox games passing 1,000, 10,000 and 100,000 players a day.",
      },
      items,
    ),
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" } },
  );
}
