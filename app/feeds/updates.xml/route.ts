import { getCachedUpdateImpact } from "@/lib/trends/cached";
import { renderRss, updateItems } from "@/lib/feeds";

export const revalidate = 3600;

export async function GET() {
  const impact = await getCachedUpdateImpact().catch(() => null);
  return new Response(
    renderRss(
      {
        title: "Roblox Pulse: announced updates",
        path: "/feeds/updates.xml",
        description: "Roblox games that announced an update in their title, and what happened to their players two days later.",
      },
      impact ? updateItems(impact) : [],
    ),
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" } },
  );
}
